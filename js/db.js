// Database and state management for Timetable Generator

export const DEFAULT_TIME_SETTINGS = {
  days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
  slotsPerDay: 15,
  slotTimes: [
    "S-1 (8:00 - 8:30)",
    "S-2 (8:30 - 9:00)",
    "S-3 (9:00 - 9:30)",
    "S-4 (9:30 - 10:00)",
    "S-5 (10:00 - 10:30)",
    "S-6 (10:30 - 11:00)",
    "S-7 (11:00 - 11:30)",
    "S-8 (11:30 - 12:00)",
    "S-9 (12:00 - 12:30)",
    "S-10 (12:30 - 1:00)",
    "S-11 (1:00 - 2:00 Lunch/Prayer)",
    "S-12 (2:00 - 2:30)",
    "S-13 (2:30 - 3:00)",
    "S-14 (3:00 - 3:30)",
    "S-15 (3:30 - 4:00)"
  ],
  slotDuration: 30 // minutes
};

export const PRESETS = {
  version: "uet_mardan_v3",
  teachers: [
    { id: "t1", name: "Prof. Dr. Muhammad Usman", email: "m.usman@uetmardan.edu.pk", maxHours: 16, availability: createAvailabilityMatrix(5, 15, true) },
    { id: "t2", name: "Mr. Abdul Saboor", email: "abdul.saboor@uetmardan.edu.pk", maxHours: 16, availability: createAvailabilityMatrix(5, 15, true) },
    { id: "t3", name: "Mr. Mohsin Ali Shah", email: "mohsin.shah@uetmardan.edu.pk", maxHours: 16, availability: createAvailabilityMatrix(5, 15, true) },
    { id: "t4", name: "Ms. Alishba Drakshai", email: "alishba.d@uetmardan.edu.pk", maxHours: 16, availability: createAvailabilityMatrix(5, 15, true) },
    { id: "t5", name: "Mr. Shehzad Ahmed", email: "shehzad@uetmardan.edu.pk", maxHours: 16, availability: createAvailabilityMatrix(5, 15, true) },
    { id: "t6", name: "Dr. Riazullah Khan", email: "riaz@uetmardan.edu.pk", maxHours: 16, availability: createAvailabilityMatrix(5, 15, true) },
    { id: "t7", name: "Mr. Talha Ilias", email: "talha@uetmardan.edu.pk", maxHours: 16, availability: createAvailabilityMatrix(5, 15, true) },
    { id: "t8", name: "Prof. Dr. Murtaza Ali", email: "murtaza@uetmardan.edu.pk", maxHours: 16, availability: createAvailabilityMatrix(5, 15, true) },
    { id: "t9", name: "Dr. Qaisar", email: "qaisar@uetmardan.edu.pk", maxHours: 16, availability: createAvailabilityMatrix(5, 15, true) },
    { id: "t10", name: "Mr. Fawad Khan", email: "fawad@uetmardan.edu.pk", maxHours: 16, availability: createAvailabilityMatrix(5, 15, true) },
    { id: "t11", name: "Mr. Saqib", email: "saqib@uetmardan.edu.pk", maxHours: 12, availability: createAvailabilityMatrix(5, 15, true) },
    { id: "t12", name: "Dr. Hamid", email: "hamid@uetmardan.edu.pk", maxHours: 16, availability: createAvailabilityMatrix(5, 15, true) },
    { id: "t13", name: "Ms. Faiza", email: "faiza@uetmardan.edu.pk", maxHours: 16, availability: createAvailabilityMatrix(5, 15, true) },
    { id: "t14", name: "Dr. Bilal Khan", email: "bilal@uetmardan.edu.pk", maxHours: 16, availability: createAvailabilityMatrix(5, 15, true) },
    { id: "t15", name: "Dr. Shams", email: "shams@uetmardan.edu.pk", maxHours: 16, availability: createAvailabilityMatrix(5, 15, true) },
    { id: "t16", name: "Dr. Tariq", email: "tariq@uetmardan.edu.pk", maxHours: 16, availability: createAvailabilityMatrix(5, 15, true) },
    { id: "t17", name: "Dr. Raza", email: "raza@uetmardan.edu.pk", maxHours: 16, availability: createAvailabilityMatrix(5, 15, true) },
    { id: "t18", name: "Ms. Hafsa Fayyaz", email: "hafsa@uetmardan.edu.pk", maxHours: 16, availability: createAvailabilityMatrix(5, 15, true) },
    { id: "t19", name: "Mr. Yasir", email: "yasir@uetmardan.edu.pk", maxHours: 12, availability: createAvailabilityMatrix(5, 15, true) },
    { id: "t20", name: "Mr. Asad Jan", email: "asad@uetmardan.edu.pk", maxHours: 16, availability: createAvailabilityMatrix(5, 15, true) },
    { id: "t21", name: "Mr. Taseer", email: "taseer@uetmardan.edu.pk", maxHours: 16, availability: createAvailabilityMatrix(5, 15, true) },
    { id: "t22", name: "Mr. Taseer Ullah", email: "taseer.ullah@uetmardan.edu.pk", maxHours: 16, availability: createAvailabilityMatrix(5, 15, true) },
    { id: "t23", name: "Mr. Zaheen Ahmed", email: "zaheen@uetmardan.edu.pk", maxHours: 16, availability: createAvailabilityMatrix(5, 15, true) },
    { id: "t24", name: "Dr. Inayat Khan", email: "inayat@uetmardan.edu.pk", maxHours: 16, availability: createAvailabilityMatrix(5, 15, true) },
    { id: "t25", name: "Mr. Mian Saeed Akbar", email: "saeed@uetmardan.edu.pk", maxHours: 16, availability: createAvailabilityMatrix(5, 15, true) },
    { id: "t26", name: "Ms. Laiba", email: "laiba@uetmardan.edu.pk", maxHours: 16, availability: createAvailabilityMatrix(5, 15, true) },
    { id: "t27", name: "Mr. Daniyal", email: "daniyal@uetmardan.edu.pk", maxHours: 16, availability: createAvailabilityMatrix(5, 15, true) },
    { id: "t28", name: "Mr. Fayaz", email: "fayaz@uetmardan.edu.pk", maxHours: 16, availability: createAvailabilityMatrix(5, 15, true) },
    { id: "t29", name: "Ms. Fatima Nasir", email: "fatima@uetmardan.edu.pk", maxHours: 16, availability: createAvailabilityMatrix(5, 15, true) },
    { id: "t30", name: "Ms. Laiba Bukhari", email: "laiba.b@uetmardan.edu.pk", maxHours: 16, availability: createAvailabilityMatrix(5, 15, true) },
    { id: "t31", name: "Dr. Mushtaq", email: "mushtaq@uetmardan.edu.pk", maxHours: 16, availability: createAvailabilityMatrix(5, 15, true) }
  ],
  rooms: [
    { id: "r1", name: "CR-1", type: "lecture", capacity: 55, availability: createAvailabilityMatrix(5, 15, true) },
    { id: "r2", name: "CR-2", type: "lecture", capacity: 50, availability: createAvailabilityMatrix(5, 15, true) },
    { id: "r3", name: "CR-3", type: "lecture", capacity: 50, availability: createAvailabilityMatrix(5, 15, true) },
    { id: "r4", name: "CR-4", type: "lecture", capacity: 45, availability: createAvailabilityMatrix(5, 15, true) },
    { id: "r5", name: "CR-D", type: "lecture", capacity: 40, availability: createAvailabilityMatrix(5, 15, true) },
    { id: "r6", name: "AI & DS Lab", type: "lab", capacity: 40, availability: createAvailabilityMatrix(5, 15, true) },
    { id: "r7", name: "Comp Lab", type: "lab", capacity: 45, availability: createAvailabilityMatrix(5, 15, true) },
    { id: "r8", name: "Prog Lab", type: "lab", capacity: 45, availability: createAvailabilityMatrix(5, 15, true) },
    { id: "r9", name: "ME-04", type: "lecture", capacity: 40, availability: createAvailabilityMatrix(5, 15, true) },
    { id: "r10", name: "Seminar Hall", type: "lecture", capacity: 120, availability: createAvailabilityMatrix(5, 15, true) },
    { id: "r11", name: "CSE Lab", type: "lab", capacity: 40, availability: createAvailabilityMatrix(5, 15, true) },
    { id: "r12", name: "CSE CR", type: "lecture", capacity: 45, availability: createAvailabilityMatrix(5, 15, true) }
  ],
  sections: [
    { id: "s1", name: "BSCS-2A", size: 40, program: "Computer Science", semester: 2, department: "Computer Science", batchYear: 2025, field: "General", section: "A" },
    { id: "s2", name: "BSCS-2B", size: 40, program: "Computer Science", semester: 2, department: "Computer Science", batchYear: 2025, field: "General", section: "B" },
    { id: "s3", name: "BSCS-2C", size: 40, program: "Computer Science", semester: 2, department: "Computer Science", batchYear: 2025, field: "General", section: "C" },
    { id: "s4", name: "BSCS-4A", size: 45, program: "Computer Science", semester: 4, department: "Computer Science", batchYear: 2024, field: "General", section: "A" },
    { id: "s5", name: "BSCS-4B", size: 45, program: "Computer Science", semester: 4, department: "Computer Science", batchYear: 2024, field: "General", section: "B" },
    { id: "s6", name: "BSCS-4C", size: 45, program: "Computer Science", semester: 4, department: "Computer Science", batchYear: 2024, field: "General", section: "C" },
    { id: "s7", name: "BSCS-4D", size: 45, program: "Computer Science", semester: 4, department: "Computer Science", batchYear: 2024, field: "General", section: "D" },
    { id: "s8", name: "BS-AI-6", size: 35, program: "Artificial Intelligence", semester: 6, department: "Computer Science", batchYear: 2023, field: "AI", section: "" },
    { id: "s9", name: "BS-CS-6", size: 40, program: "Computer Science", semester: 6, department: "Computer Science", batchYear: 2023, field: "CS", section: "" },
    { id: "s10", name: "BS-DS-6", size: 35, program: "Data Science", semester: 6, department: "Computer Science", batchYear: 2023, field: "DS", section: "" }
  ],
  courses: [
    // 2nd Semester Theory Courses
    { id: "c1", code: "CS103", name: "Digital Logic Design (A)", sessionsPerWeek: 2, roomType: "lecture", teacherId: "t2", sectionIds: ["s1"] },
    { id: "c2", code: "CS103", name: "Digital Logic Design (BC)", sessionsPerWeek: 2, roomType: "lecture", teacherId: "t1", sectionIds: ["s2", "s3"] },
    { id: "c3", code: "CS104", name: "Object Oriented Programming (A)", sessionsPerWeek: 2, roomType: "lecture", teacherId: "t1", sectionIds: ["s1"] },
    { id: "c4", code: "CS104", name: "Object Oriented Programming (B)", sessionsPerWeek: 2, roomType: "lecture", teacherId: "t5", sectionIds: ["s2"] },
    { id: "c5", code: "CS104", name: "Object Oriented Programming (C)", sessionsPerWeek: 2, roomType: "lecture", teacherId: "t6", sectionIds: ["s3"] },
    { id: "c6", code: "Discrete", name: "Discrete Structures (A)", sessionsPerWeek: 2, roomType: "lecture", teacherId: "t2", sectionIds: ["s1"] },
    { id: "c7", code: "Discrete", name: "Discrete Structures (B)", sessionsPerWeek: 2, roomType: "lecture", teacherId: "t12", sectionIds: ["s2"] },
    { id: "c8", code: "Discrete", name: "Discrete Structures (C)", sessionsPerWeek: 2, roomType: "lecture", teacherId: "t7", sectionIds: ["s3"] },
    { id: "c9", code: "Pre-calculus II", name: "Pre-Calculus II", sessionsPerWeek: 2, roomType: "lecture", teacherId: "t8", sectionIds: ["s1", "s2", "s3"] },
    { id: "c10", code: "BSH-122", name: "Linear Algebra", sessionsPerWeek: 2, roomType: "lecture", teacherId: "t9", sectionIds: ["s1", "s2", "s3"] },
    { id: "c11", code: "Exp. Writing", name: "Expository Writing (Online)", sessionsPerWeek: 2, roomType: "lecture", teacherId: "t10", sectionIds: ["s1", "s2", "s3"] },
    { id: "c12", code: "Ideology", name: "Ideology & Constitution (Online)", sessionsPerWeek: 1, roomType: "lecture", teacherId: "t11", sectionIds: ["s1", "s2", "s3"] },

    // 2nd Semester Labs
    { id: "c13", code: "CS103L", name: "Digital Logic Design Lab (AB)", sessionsPerWeek: 1, roomType: "lab", teacherId: "t4", sectionIds: ["s1", "s2"] },
    { id: "c14", code: "CS103L", name: "Digital Logic Design Lab (C)", sessionsPerWeek: 1, roomType: "lab", teacherId: "t3", sectionIds: ["s3"] },
    { id: "c15", code: "CS104L", name: "Object Oriented Prog Lab (A)", sessionsPerWeek: 1, roomType: "lab", teacherId: "t4", sectionIds: ["s1"] },
    { id: "c16", code: "CS104L", name: "Object Oriented Prog Lab (B)", sessionsPerWeek: 1, roomType: "lab", teacherId: "t5", sectionIds: ["s2"] },
    { id: "c17", code: "CS104L", name: "Object Oriented Prog Lab (C)", sessionsPerWeek: 1, roomType: "lab", teacherId: "t6", sectionIds: ["s3"] },

    // 4th Semester Selected Courses
    { id: "c18", code: "CS301", name: "Operating Systems (A)", sessionsPerWeek: 2, roomType: "lecture", teacherId: "t24", sectionIds: ["s4"] },
    { id: "c19", code: "CS301", name: "Operating Systems (B)", sessionsPerWeek: 2, roomType: "lecture", teacherId: "t7", sectionIds: ["s5"] },
    { id: "c20", code: "CS205", name: "Artificial Intelligence (A)", sessionsPerWeek: 2, roomType: "lecture", teacherId: "t5", sectionIds: ["s4"] },
    { id: "c21", code: "CS205", name: "Artificial Intelligence (B)", sessionsPerWeek: 2, roomType: "lecture", teacherId: "t14", sectionIds: ["s5"] },
    { id: "c22", code: "CS301L", name: "Operating Systems Lab (A)", sessionsPerWeek: 1, roomType: "lab", teacherId: "t24", sectionIds: ["s4"] },
    { id: "c23", code: "CS301L", name: "Operating Systems Lab (B)", sessionsPerWeek: 1, roomType: "lab", teacherId: "t7", sectionIds: ["s5"] },

    // 6th Semester Selected Courses
    { id: "c24", code: "CS305", name: "Parallel & Distributed Comp (CS)", sessionsPerWeek: 2, roomType: "lecture", teacherId: "t22", sectionIds: ["s9"] },
    { id: "c25", code: "Web Dev", name: "Web Design & Development (CS)", sessionsPerWeek: 2, roomType: "lecture", teacherId: "t25", sectionIds: ["s9"] },
    { id: "c26", code: "Web Dev Lab", name: "Web Design Lab (CS)", sessionsPerWeek: 1, roomType: "lab", teacherId: "t25", sectionIds: ["s9"] }
  ],
  schedules: []
};

// Setup default schedule sessions matching the UET Mardan sheets
PRESETS.schedules = [
  {
    id: "sch_uet_mardan_initial",
    name: "UET Mardan CS Initial Timetable",
    fitness: 0,
    sessions: [
      // Section A (BSCS-2A)
      { id: "sa1", courseId: "c1", courseCode: "CS103", courseName: "Digital Logic Design (A)", teacherId: "t2", sectionIds: ["s1"], roomId: "r4", day: 0, slot: 0 }, // Mon S-1..S-3
      { id: "sa2", courseId: "c3", courseCode: "CS104", courseName: "Object Oriented Programming (A)", teacherId: "t1", sectionIds: ["s1"], roomId: "r1", day: 0, slot: 7 }, // Mon S-8..S-10
      { id: "sa3", courseId: "c6", courseCode: "Discrete", courseName: "Discrete Structures (A)", teacherId: "t2", sectionIds: ["s1"], roomId: "r3", day: 1, slot: 0 }, // Tue S-1..S-3
      { id: "sa4", courseId: "c9", courseCode: "Pre-calculus II", courseName: "Pre-Calculus II", teacherId: "t8", sectionIds: ["s1"], roomId: "r10", day: 1, slot: 4 }, // Tue S-5..S-7
      { id: "sa5", courseId: "c9", courseCode: "Pre-calculus II", courseName: "Pre-Calculus II", teacherId: "t8", sectionIds: ["s1"], roomId: "r10", day: 1, slot: 7 }, // Tue S-8..S-10
      { id: "sa6", courseId: "c13", courseCode: "CS103L", courseName: "Digital Logic Design Lab (AB)", teacherId: "t4", sectionIds: ["s1"], roomId: "r6", day: 2, slot: 11 }, // Wed S-12..S-15 (afternoon lab)
      { id: "sa7", courseId: "c3", courseCode: "CS104", courseName: "Object Oriented Programming (A)", teacherId: "t1", sectionIds: ["s1"], roomId: "r1", day: 3, slot: 0 }, // Thu S-1..S-3
      { id: "sa8", courseId: "c11", courseCode: "Exp. Writing", courseName: "Expository Writing (Online)", teacherId: "t10", sectionIds: ["s1"], roomId: "r12", day: 3, slot: 3 }, // Thu S-4..S-6
      { id: "sa9", courseId: "c12", courseCode: "Ideology", courseName: "Ideology & Constitution (Online)", teacherId: "t11", sectionIds: ["s1"], roomId: "r12", day: 3, slot: 7 }, // Thu S-8..S-10
      { id: "sa10", courseId: "c11", courseCode: "Exp. Writing", courseName: "Expository Writing (Online)", teacherId: "t10", sectionIds: ["s1"], roomId: "r12", day: 0, slot: 4 }, // Mon S-5..S-7

      // Section B (BSCS-2B)
      { id: "sb1", courseId: "c2", courseCode: "CS103", courseName: "Digital Logic Design (BC)", teacherId: "t1", sectionIds: ["s2"], roomId: "r1", day: 0, slot: 0 }, // Mon S-1..S-3
      { id: "sb2", courseId: "c7", courseCode: "Discrete", courseName: "Discrete Structures (B)", teacherId: "t12", sectionIds: ["s2"], roomId: "r4", day: 0, slot: 4 }, // Mon S-5..S-7
      { id: "sb3", courseId: "c4", courseCode: "CS104", courseName: "Object Oriented Programming (B)", teacherId: "t5", sectionIds: ["s2"], roomId: "r1", day: 1, slot: 7 }, // Tue S-8..S-10
      { id: "sb4", courseId: "c16", courseCode: "CS104L", courseName: "Object Oriented Prog Lab (B)", teacherId: "t5", sectionIds: ["s2"], roomId: "r6", day: 2, slot: 11 }, // Wed S-12..S-15 (afternoon lab)
      { id: "sb5", courseId: "c10", courseCode: "BSH-122", courseName: "Linear Algebra", teacherId: "t9", sectionIds: ["s2"], roomId: "r9", day: 1, slot: 11 }, // Tue S-12..S-14 (afternoon theory)

      // Section C (BSCS-2C)
      { id: "sc1", courseId: "c8", courseCode: "Discrete", courseName: "Discrete Structures (C)", teacherId: "t7", sectionIds: ["s3"], roomId: "r2", day: 0, slot: 0 }, // Mon S-1..S-3
      { id: "sc2", courseId: "c2", courseCode: "CS103", courseName: "Digital Logic Design (BC)", teacherId: "t1", sectionIds: ["s3"], roomId: "r1", day: 1, slot: 0 }, // Tue S-1..S-3
      { id: "sc3", courseId: "c5", courseCode: "CS104", courseName: "Object Oriented Programming (C)", teacherId: "t6", sectionIds: ["s3"], roomId: "r1", day: 2, slot: 7 }, // Wed S-8..S-10
      { id: "sc4", courseId: "c14", courseCode: "CS103L", courseName: "Digital Logic Design Lab (C)", teacherId: "t3", sectionIds: ["s3"], roomId: "r7", day: 3, slot: 11 }  // Thu S-12..S-15
    ]
  }
];

function createAvailabilityMatrix(days, slots, defaultValue = true) {
  const matrix = [];
  for (let d = 0; d < days; d++) {
    const dayRow = new Array(slots).fill(defaultValue);
    if (slots >= 11) {
      dayRow[10] = false; // Lunch & Prayer Break is slot index 10 (S-11)
    }
    matrix.push(dayRow);
  }
  return matrix;
}

export class DB {
  constructor() {
    this.key = "uni_timetable_generator_db";
    this.load();
  }

  load() {
    const data = localStorage.getItem(this.key);
    if (data) {
      try {
        const parsed = JSON.parse(data);
        // Force reset if preset version is different (allows agent to push new data)
        if (parsed.presetVersion !== (PRESETS.version || "uet_mardan_v2")) {
          console.warn("Preset version mismatch, resetting to new presets:", PRESETS.version);
          this.resetToPresets();
          return;
        }
        this.teachers = parsed.teachers || [];
        this.rooms = parsed.rooms || [];
        this.sections = (parsed.sections || []).map(s => {
          if (!s.department) s.department = s.program || "Computer Science";
          if (!s.batchYear) {
            const match = s.name.match(/\d+/);
            const sem = match ? parseInt(match[0]) : (s.semester || 2);
            s.batchYear = 2026 - Math.ceil(sem / 2);
          }
          if (!s.field) {
            if (s.name.includes("-AI-") || s.name.toLowerCase().includes("ai")) s.field = "AI";
            else if (s.name.includes("-DS-") || s.name.toLowerCase().includes("ds")) s.field = "DS";
            else if (s.name.includes("-CS-") || s.name.toLowerCase().includes("cs")) s.field = "CS";
            else s.field = "General";
          }
          if (s.section === undefined) {
            const match = s.name.match(/[A-D]$/);
            s.section = match ? match[0] : "";
          }
          return s;
        });
        this.courses = parsed.courses || [];
        this.timeSettings = parsed.timeSettings || DEFAULT_TIME_SETTINGS;
        this.schedules = parsed.schedules || [];
        this.activeScheduleId = parsed.activeScheduleId || null;
      } catch (e) {
        console.error("Error loading database, resetting to empty", e);
        this.resetToEmpty();
      }
    } else {
      this.resetToPresets();
    }
  }

  save() {
    const data = {
      presetVersion: PRESETS.version || "uet_mardan_v2",
      teachers: this.teachers,
      rooms: this.rooms,
      sections: this.sections,
      courses: this.courses,
      timeSettings: this.timeSettings,
      schedules: this.schedules,
      activeScheduleId: this.activeScheduleId
    };
    localStorage.setItem(this.key, JSON.stringify(data));
  }

  resetToEmpty() {
    this.teachers = [];
    this.rooms = [];
    this.sections = [];
    this.courses = [];
    this.timeSettings = { ...DEFAULT_TIME_SETTINGS };
    this.schedules = [];
    this.activeScheduleId = null;
    this.save();
  }

  resetToPresets() {
    this.teachers = JSON.parse(JSON.stringify(PRESETS.teachers || []));
    this.rooms = JSON.parse(JSON.stringify(PRESETS.rooms || []));
    this.sections = JSON.parse(JSON.stringify(PRESETS.sections || []));
    this.courses = JSON.parse(JSON.stringify(PRESETS.courses || []));
    this.timeSettings = JSON.parse(JSON.stringify(DEFAULT_TIME_SETTINGS));
    
    // Load pre-configured schedules if they exist in presets
    if (PRESETS.schedules && PRESETS.schedules.length > 0) {
      this.schedules = JSON.parse(JSON.stringify(PRESETS.schedules));
      this.activeScheduleId = this.schedules[0].id;
    } else {
      this.schedules = [];
      this.activeScheduleId = null;
    }
    
    this.save();
  }

  importData(importedData) {
    if (importedData.teachers) this.teachers = importedData.teachers;
    if (importedData.rooms) this.rooms = importedData.rooms;
    if (importedData.sections) this.sections = importedData.sections;
    if (importedData.courses) this.courses = importedData.courses;
    if (importedData.timeSettings) this.timeSettings = importedData.timeSettings;
    if (importedData.schedules) this.schedules = importedData.schedules;
    if (importedData.activeScheduleId !== undefined) this.activeScheduleId = importedData.activeScheduleId;
    this.save();
  }

  // General CRUD wrappers
  getAll(type) {
    return this[type] || [];
  }

  getById(type, id) {
    return this.getAll(type).find(item => item.id === id);
  }

  add(type, item) {
    if (!item.id) {
      item.id = type.slice(0, 1) + "_" + Math.random().toString(36).substr(2, 9);
    }
    this[type].push(item);
    this.save();
    return item;
  }

  update(type, id, updatedFields) {
    const index = this[type].findIndex(item => item.id === id);
    if (index !== -1) {
      this[type][index] = { ...this[type][index], ...updatedFields };
      this.save();
      return this[type][index];
    }
    return null;
  }

  delete(type, id) {
    const index = this[type].findIndex(item => item.id === id);
    if (index !== -1) {
      this[type].splice(index, 1);
      // Clean up dependencies if necessary
      if (type === "teachers") {
        // Remove teacher assignments from courses
        this.courses.forEach(c => {
          if (c.teacherId === id) c.teacherId = "";
        });
      } else if (type === "sections") {
        // Remove section from courses
        this.courses.forEach(c => {
          c.sectionIds = c.sectionIds.filter(sid => sid !== id);
        });
      }
      this.save();
      return true;
    }
    return false;
  }

  // Active schedule management
  getActiveSchedule() {
    if (!this.activeScheduleId) return null;
    return this.schedules.find(s => s.id === this.activeScheduleId);
  }

  setActiveSchedule(scheduleId) {
    this.activeScheduleId = scheduleId;
    this.save();
  }

  addSchedule(schedule) {
    if (!schedule.id) {
      schedule.id = "sch_" + Math.random().toString(36).substr(2, 9);
    }
    this.schedules.push(schedule);
    this.activeScheduleId = schedule.id;
    this.save();
    return schedule;
  }

  deleteSchedule(scheduleId) {
    this.schedules = this.schedules.filter(s => s.id !== scheduleId);
    if (this.activeScheduleId === scheduleId) {
      this.activeScheduleId = this.schedules.length > 0 ? this.schedules[0].id : null;
    }
    this.save();
  }
}
