// Scheduler controller and validation helper

let worker = null;

// Helper to determine all slot indexes occupied by a session
export function getOccupiedSlots(startSlot, roomType) {
  // If lab: S-1 starts at 0, spans 6 slots (3h). S-12 starts at 11, spans 4 slots (2h/3h format). Else 6 slots.
  // If lecture: spans 3 slots (1.5 hours).
  const duration = roomType === "lab" ? (startSlot === 0 ? 6 : (startSlot === 11 ? 4 : 6)) : 3;
  const slots = [];
  for (let i = 0; i < duration; i++) {
    const s = startSlot + i;
    if (s < 15) {
      slots.push(s);
    }
  }
  return slots;
}

/**
 * Start the Genetic Algorithm solver in the background Web Worker.
 * @param {Object} dbState The current database state (teachers, rooms, courses, sections, timeSettings)
 * @param {Object} callbacks Callback functions for success, progress, and failure
 */
export function startScheduling(dbState, callbacks) {
  // Stop existing solver if running
  stopScheduling();

  // Create Web Worker
  worker = new Worker("./js/worker.js");

  worker.onmessage = function (e) {
    const { type, ...payload } = e.data;
    if (type === "progress" && callbacks.onProgress) {
      callbacks.onProgress(payload);
    } else if (type === "success" && callbacks.onSuccess) {
      callbacks.onSuccess(payload);
      stopScheduling();
    } else if (type === "failure" && callbacks.onFailure) {
      callbacks.onFailure(payload);
      stopScheduling();
    }
  };

  // Prepare config to send to the worker
  const config = {
    teachers: dbState.getAll("teachers"),
    rooms: dbState.getAll("rooms"),
    courses: dbState.getAll("courses"),
    sections: dbState.getAll("sections"),
    timeSettings: dbState.timeSettings,
    popSize: 120,
    mutationRate: 0.18,
    maxGenerations: 1200,
    elitismCount: 6
  };

  worker.postMessage({ action: "start", config });
}

/**
 * Terminate the active background Web Worker.
 */
export function stopScheduling() {
  if (worker) {
    worker.terminate();
    worker = null;
  }
}

/**
 * Validates a schedule (list of sessions) against hard and soft constraints.
 * Useful for real-time validation in the UI during drag-and-drop actions.
 * @param {Array} sessions The list of schedule sessions
 * @param {Object} db The database class instance
 * @returns {Object} Report containing boolean `isValid` and arrays of conflict details
 */
export function checkConflicts(sessions, db) {
  const teachers = db.getAll("teachers");
  const rooms = db.getAll("rooms");
  const sections = db.getAll("sections");
  
  const teacherMap = new Map(teachers.map(t => [t.id, t]));
  const roomMap = new Map(rooms.map(r => [r.id, r]));
  const sectionMap = new Map(sections.map(s => [s.id, s]));

  const conflicts = [];
  const warnings = [];

  // Index maps to find clashes
  // Keys: "day_slot_resourceId" -> array of session objects
  const teacherTime = {};
  const roomTime = {};
  const sectionTime = {};

  sessions.forEach(sess => {
    const { day, slot, roomId, teacherId, sectionIds, courseCode, courseId } = sess;
    if (day === undefined || slot === undefined || day < 0 || slot < 0) return;

    // Resolve room type from course catalog
    const course = db.getById("courses", courseId);
    const roomType = sess.roomType || (course ? course.roomType : "lecture");
    const occupied = getOccupiedSlots(slot, roomType);

    // 1. Check Teacher availability & clashes
    if (teacherId) {
      const teacher = teacherMap.get(teacherId);
      if (teacher) {
        // Availability check over all spanned slots
        let unavailableSlot = -1;
        occupied.forEach(s => {
          if (teacher.availability && teacher.availability[day] && teacher.availability[day][s] === false) {
            unavailableSlot = s;
          }
        });
        if (unavailableSlot !== -1) {
          conflicts.push({
            type: "teacher_unavailability",
            message: `Instructor ${teacher.name} is marked as unavailable on ${db.timeSettings.days[day]} at period S-${unavailableSlot + 1}.`,
            sessions: [sess]
          });
        }

        // Clash check registration for all occupied slots
        occupied.forEach(s => {
          const tKey = `${day}_${s}_${teacherId}`;
          if (!teacherTime[tKey]) teacherTime[tKey] = [];
          teacherTime[tKey].push(sess);
        });
      }
    }

    // 2. Check Room availability, capacity, & clashes
    if (roomId) {
      const room = roomMap.get(roomId);
      if (room) {
        // Availability check over all spanned slots
        let unavailableSlot = -1;
        occupied.forEach(s => {
          if (room.availability && room.availability[day] && room.availability[day][s] === false) {
            unavailableSlot = s;
          }
        });
        if (unavailableSlot !== -1) {
          conflicts.push({
            type: "room_unavailability",
            message: `Room ${room.name} is marked as unavailable on ${db.timeSettings.days[day]} at period S-${unavailableSlot + 1}.`,
            sessions: [sess]
          });
        }

        // Capacity check
        let totalStudentCount = 0;
        if (sectionIds) {
          sectionIds.forEach(sid => {
            const s = sectionMap.get(sid);
            if (s) totalStudentCount += s.size;
          });
        }
        if (room.capacity < totalStudentCount) {
          conflicts.push({
            type: "room_capacity",
            message: `Room ${room.name} capacity (${room.capacity}) is too small for sections size (${totalStudentCount}).`,
            sessions: [sess]
          });
        }

        // Type match check
        if (course && course.roomType !== room.type) {
          conflicts.push({
            type: "room_type_mismatch",
            message: `Course ${courseCode} requires a '${course.roomType}' room, but is scheduled in '${room.name}' (${room.type}).`,
            sessions: [sess]
          });
        }

        // Clash check registration for all occupied slots
        occupied.forEach(s => {
          const rKey = `${day}_${s}_${roomId}`;
          if (!roomTime[rKey]) roomTime[rKey] = [];
          roomTime[rKey].push(sess);
        });
      }
    }

    // 3. Check Section clashes over all occupied slots
    if (sectionIds && sectionIds.length > 0) {
      sectionIds.forEach(sid => {
        occupied.forEach(s => {
          const sKey = `${day}_${s}_${sid}`;
          if (!sectionTime[sKey]) sectionTime[sKey] = [];
          sectionTime[sKey].push(sess);
        });
      });
    }
  });

  // Evaluate Clashes from maps
  // Teacher clashes
  for (const key in teacherTime) {
    if (teacherTime[key].length > 1) {
      const sessList = teacherTime[key];
      const teacher = teacherMap.get(sessList[0].teacherId);
      const names = [...new Set(sessList.map(s => s.courseCode))].join(" and ");
      const parts = key.split("_");
      conflicts.push({
        type: "teacher_clash",
        message: `Instructor ${teacher ? teacher.name : "Unknown"} is double-booked for courses: ${names} on ${db.timeSettings.days[parts[0]]} at period S-${parseInt(parts[1]) + 1}.`,
        sessions: sessList
      });
    }
  }

  // Room clashes
  for (const key in roomTime) {
    if (roomTime[key].length > 1) {
      const sessList = roomTime[key];
      const room = roomMap.get(sessList[0].roomId);
      const names = [...new Set(sessList.map(s => `${s.courseCode} (${db.getById("sections", s.sectionIds[0])?.name || "Multiple"})`))].join(" and ");
      const parts = key.split("_");
      conflicts.push({
        type: "room_clash",
        message: `Room ${room ? room.name : "Unknown"} is double-booked on ${db.timeSettings.days[parts[0]]} at period S-${parseInt(parts[1]) + 1} for: ${names}.`,
        sessions: sessList
      });
    }
  }

  // Section clashes
  for (const key in sectionTime) {
    if (sectionTime[key].length > 1) {
      const sessList = sectionTime[key];
      // Only conflict if it's different classes (multiple sections attending the exact same class is okay!)
      const uniqueSessions = new Set(sessList.map(s => s.id));
      if (uniqueSessions.size > 1) {
        const parts = key.split("_");
        const sectionId = parts[2];
        const section = sectionMap.get(sectionId);
        const names = [...new Set(sessList.map(s => s.courseCode))].join(" and ");
        conflicts.push({
          type: "section_clash",
          message: `Class Section ${section ? section.name : "Unknown"} has overlapping classes on ${db.timeSettings.days[parts[0]]} at period S-${parseInt(parts[1]) + 1}: ${names}.`,
          sessions: sessList
        });
      }
    }
  }

  // Soft constraints audit (Warnings)
  // Teacher consecutive hours (> 6 periods/3 hours)
  const teacherDayBuckets = {}; // "teacherId_day" -> [slot numbers]
  sessions.forEach(sess => {
    if (sess.teacherId) {
      const course = db.getById("courses", sess.courseId);
      const roomType = sess.roomType || (course ? course.roomType : "lecture");
      const occupied = getOccupiedSlots(sess.slot, roomType);
      
      const key = `${sess.teacherId}_${sess.day}`;
      if (!teacherDayBuckets[key]) teacherDayBuckets[key] = [];
      
      occupied.forEach(s => {
        if (!teacherDayBuckets[key].includes(s)) {
          teacherDayBuckets[key].push(s);
        }
      });
    }
  });

  for (const key in teacherDayBuckets) {
    const slots = [...teacherDayBuckets[key]].sort((a, b) => a - b);
    let consecutive = 1;
    let maxConsec = 1;
    for (let i = 0; i < slots.length - 1; i++) {
      if (slots[i+1] - slots[i] === 1) {
        consecutive++;
        maxConsec = Math.max(maxConsec, consecutive);
      } else {
        consecutive = 1;
      }
    }
    if (maxConsec > 6) { // Labs are 6 periods. Warning only if teaching consecutively more than 6 slots (3 hours)
      const parts = key.split("_");
      const teacher = teacherMap.get(parts[0]);
      warnings.push({
        type: "consecutive_hours",
        message: `Instructor ${teacher ? teacher.name : "Unknown"} is scheduled for ${maxConsec} consecutive periods (${(maxConsec * 30) / 60} hours) on ${db.timeSettings.days[parts[1]]}.`
      });
    }
  }

  // Filter duplicate conflicts (e.g. if teacher clash is reported in multiple slots for the same class session)
  const uniqueConflicts = [];
  const seenConflictKeys = new Set();
  conflicts.forEach(c => {
    // Generate a unique hash for this conflict message
    const hash = `${c.type}_${c.message}`;
    if (!seenConflictKeys.has(hash)) {
      seenConflictKeys.add(hash);
      uniqueConflicts.push(c);
    }
  });

  return {
    isValid: uniqueConflicts.length === 0,
    conflicts: uniqueConflicts,
    warnings
  };
}
