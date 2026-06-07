// Genetic Algorithm Web Worker for Timetable Generation

self.onmessage = function (e) {
  const { data } = e;
  if (data.action === "start") {
    try {
      runGeneticAlgorithm(data.config);
    } catch (err) {
      self.postMessage({ type: "failure", error: err.message });
    }
  }
};

// Helper to determine all slot indexes occupied by a session
function getOccupiedSlots(startSlot, roomType) {
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

function runGeneticAlgorithm(config) {
  const {
    teachers,
    rooms,
    courses,
    sections,
    timeSettings,
    popSize = 120,
    mutationRate = 0.18,
    maxGenerations = 1200,
    elitismCount = 6
  } = config;

  const daysCount = timeSettings.days.length;
  const slotsCount = timeSettings.slotsPerDay;

  // 1. Create list of sessions to schedule
  const sessionsToSchedule = [];
  courses.forEach(course => {
    for (let i = 0; i < course.sessionsPerWeek; i++) {
      sessionsToSchedule.push({
        id: `${course.id}_sess_${i}`,
        courseId: course.id,
        courseCode: course.code,
        courseName: course.name,
        teacherId: course.teacherId,
        sectionIds: course.sectionIds,
        roomType: course.roomType || "lecture",
        sessionIndex: i
      });
    }
  });

  if (sessionsToSchedule.length === 0) {
    self.postMessage({ type: "failure", error: "No courses or sessions to schedule!" });
    return;
  }

  // Pre-filter rooms by type for faster lookup during mutation/initialization
  const roomsByType = {
    lecture: rooms.filter(r => r.type === "lecture"),
    lab: rooms.filter(r => r.type === "lab")
  };

  // Cache lookups
  const teacherMap = new Map(teachers.map(t => [t.id, t]));
  const sectionMap = new Map(sections.map(s => [s.id, s]));
  const roomMap = new Map(rooms.map(r => [r.id, r]));
  const courseMap = new Map(courses.map(c => [c.id, c]));

  // Helper to generate a random gene (day, slot, room) for a session
  function getRandomGene(session) {
    const day = Math.floor(Math.random() * daysCount);
    // Restrict starting slots to UET Mardan CS department standard slots:
    // Lectures can start at S-1 (0), S-4 (3), S-5 (4), S-8 (7), S-12 (11), S-13 (12)
    // Labs can start at S-1 (0) or S-12 (11)
    const startingSlots = session.roomType === "lab" ? [0, 11] : [0, 3, 4, 7, 11, 12];
    const slot = startingSlots[Math.floor(Math.random() * startingSlots.length)];
    
    const compatibleRooms = roomsByType[session.roomType] || rooms;
    let roomId = "";
    if (compatibleRooms.length > 0) {
      const randomRoom = compatibleRooms[Math.floor(Math.random() * compatibleRooms.length)];
      roomId = randomRoom.id;
    }
    
    return { day, slot, roomId };
  }

  // 2. Initialize Population
  let population = [];
  for (let i = 0; i < popSize; i++) {
    const chromosome = sessionsToSchedule.map(session => {
      const gene = getRandomGene(session);
      return {
        ...session,
        day: gene.day,
        slot: gene.slot,
        roomId: gene.roomId
      };
    });
    population.push({
      chromosome,
      fitness: 0,
      conflicts: 0,
      hardConflicts: 0,
      softConflicts: 0,
      breakdown: {}
    });
  }

  // Evaluate initial population
  population.forEach(ind => evaluateFitness(ind));

  let generation = 0;
  let bestIndividual = getBestIndividual(population);

  while (generation < maxGenerations && bestIndividual.hardConflicts > 0) {
    generation++;

    // Sort population by fitness ascending
    population.sort((a, b) => a.fitness - b.fitness);
    
    const nextGeneration = [];

    // Elitism
    for (let i = 0; i < elitismCount; i++) {
      nextGeneration.push(JSON.parse(JSON.stringify(population[i])));
    }

    // Breed rest of the population
    while (nextGeneration.length < popSize) {
      const parent1 = selectParent(population);
      const parent2 = selectParent(population);
      const childChromosome = crossover(parent1.chromosome, parent2.chromosome);
      mutate(childChromosome);

      const child = {
        chromosome: childChromosome,
        fitness: 0,
        conflicts: 0,
        hardConflicts: 0,
        softConflicts: 0,
        breakdown: {}
      };
      evaluateFitness(child);
      nextGeneration.push(child);
    }

    population = nextGeneration;
    bestIndividual = getBestIndividual(population);

    // Send periodic progress updates
    if (generation % 10 === 0 || bestIndividual.hardConflicts === 0) {
      self.postMessage({
        type: "progress",
        generation,
        progressPercentage: Math.min(100, Math.round((generation / maxGenerations) * 100)),
        bestFitness: bestIndividual.fitness,
        hardConflicts: bestIndividual.hardConflicts,
        softConflicts: bestIndividual.softConflicts,
        conflicts: bestIndividual.hardConflicts + bestIndividual.softConflicts,
        chromosome: bestIndividual.chromosome
      });
    }
  }

  // Final check and report
  population.sort((a, b) => a.fitness - b.fitness);
  bestIndividual = population[0];

  if (bestIndividual.hardConflicts === 0) {
    self.postMessage({
      type: "success",
      schedule: bestIndividual.chromosome,
      fitness: bestIndividual.fitness,
      hardConflicts: bestIndividual.hardConflicts,
      softConflicts: bestIndividual.softConflicts,
      breakdown: bestIndividual.breakdown
    });
  } else {
    self.postMessage({
      type: "failure",
      error: `Could not resolve all hard constraints within ${maxGenerations} generations. Best schedule has ${bestIndividual.hardConflicts} hard conflicts.`,
      schedule: bestIndividual.chromosome,
      hardConflicts: bestIndividual.hardConflicts,
      softConflicts: bestIndividual.softConflicts
    });
  }

  // --- GA Operator Functions ---

  function selectParent(pop) {
    const tournamentSize = 5;
    let best = pop[Math.floor(Math.random() * pop.length)];
    for (let i = 1; i < tournamentSize; i++) {
      const ind = pop[Math.floor(Math.random() * pop.length)];
      if (ind.fitness < best.fitness) {
        best = ind;
      }
    }
    return best;
  }

  function crossover(parent1, parent2) {
    const crossoverPoint = Math.floor(Math.random() * parent1.length);
    const child = [];
    for (let i = 0; i < parent1.length; i++) {
      if (i < crossoverPoint) {
        child.push({ ...parent1[i] });
      } else {
        child.push({ ...parent2[i] });
      }
    }
    return child;
  }

  function mutate(chromosome) {
    for (let i = 0; i < chromosome.length; i++) {
      if (Math.random() < mutationRate) {
        const gene = getRandomGene(chromosome[i]);
        chromosome[i].day = gene.day;
        chromosome[i].slot = gene.slot;
        chromosome[i].roomId = gene.roomId;
      }
    }
  }

  function getBestIndividual(pop) {
    let best = pop[0];
    for (let i = 1; i < pop.length; i++) {
      if (pop[i].fitness < best.fitness) {
        best = pop[i];
      }
    }
    return best;
  }

  // --- Fitness Evaluation Function ---
  function evaluateFitness(individual) {
    const chrom = individual.chromosome;
    let hardPenalty = 0;
    let softPenalty = 0;

    let teacherClashes = 0;
    let roomClashes = 0;
    let sectionClashes = 0;
    let roomCapacityViolations = 0;
    let teacherAvailabilityViolations = 0;
    let roomAvailabilityViolations = 0;

    let studentGapsCount = 0;
    let teacherGapsCount = 0;
    let teacherMaxHoursViolations = 0;
    let distributionViolations = 0;

    // Booking maps over each period slot
    const teacherTimeMap = {}; // "teacherId_day_slot" -> array of sessionIds
    const roomTimeMap = {};    // "roomId_day_slot" -> array of sessionIds
    const sectionTimeMap = {}; // "sectionId_day_slot" -> array of sessionIds
    
    const courseDayMap = {};   // "courseId" -> array of days scheduled

    // Track active slots per day for gaps check
    const teacherDays = {};    // "teacherId_day" -> array of slot indexes
    const sectionDays = {};    // "sectionId_day" -> array of slot indexes

    // Fill maps and check availability / room capacities
    chrom.forEach(sess => {
      const { day, slot, roomId, teacherId, sectionIds, courseId, roomType } = sess;
      
      const occupied = getOccupiedSlots(slot, roomType || "lecture");

      // Register mappings for each slot the class spans
      occupied.forEach(s => {
        const timeKey = `${day}_${s}`;

        if (teacherId) {
          const tKey = `${teacherId}_${timeKey}`;
          if (!teacherTimeMap[tKey]) teacherTimeMap[tKey] = [];
          teacherTimeMap[tKey].push(sess.id);
        }

        if (roomId) {
          const rKey = `${roomId}_${timeKey}`;
          if (!roomTimeMap[rKey]) roomTimeMap[rKey] = [];
          roomTimeMap[rKey].push(sess.id);
        }

        if (sectionIds && sectionIds.length > 0) {
          sectionIds.forEach(sid => {
            const sKey = `${sid}_${timeKey}`;
            if (!sectionTimeMap[sKey]) sectionTimeMap[sKey] = [];
            sectionTimeMap[sKey].push(sess.id);
          });
        }
      });

      // Group active slots per day
      if (teacherId) {
        const tdKey = `${teacherId}_${day}`;
        if (!teacherDays[tdKey]) teacherDays[tdKey] = [];
        occupied.forEach(s => {
          if (!teacherDays[tdKey].includes(s)) {
            teacherDays[tdKey].push(s);
          }
        });
      }

      if (sectionIds && sectionIds.length > 0) {
        sectionIds.forEach(sid => {
          const sdKey = `${sid}_${day}`;
          if (!sectionDays[sdKey]) sectionDays[sdKey] = [];
          occupied.forEach(s => {
            if (!sectionDays[sdKey].includes(s)) {
              sectionDays[sdKey].push(s);
            }
          });
        });
      }

      // Track days for course distribution
      if (!courseDayMap[courseId]) courseDayMap[courseId] = [];
      courseDayMap[courseId].push(day);

      // Evaluate room capacity
      const room = roomMap.get(roomId);
      if (room && sectionIds) {
        let totalSize = 0;
        sectionIds.forEach(sid => {
          const sect = sectionMap.get(sid);
          if (sect) totalSize += sect.size;
        });
        if (room.capacity < totalSize) {
          roomCapacityViolations++;
        }
      }

      // Evaluate availability for all spanned slots
      if (teacherId) {
        const teacher = teacherMap.get(teacherId);
        if (teacher && teacher.availability && teacher.availability[day] !== undefined) {
          occupied.forEach(s => {
            if (teacher.availability[day][s] === false) {
              teacherAvailabilityViolations++;
            }
          });
        }
      }

      if (roomId && room) {
        if (room.availability && room.availability[day] !== undefined) {
          occupied.forEach(s => {
            if (room.availability[day][s] === false) {
              roomAvailabilityViolations++;
            }
          });
        }
      }
    });

    // Evaluate clashes from maps
    for (const key in teacherTimeMap) {
      if (teacherTimeMap[key].length > 1) {
        teacherClashes += (teacherTimeMap[key].length - 1);
      }
    }

    for (const key in roomTimeMap) {
      if (roomTimeMap[key].length > 1) {
        roomClashes += (roomTimeMap[key].length - 1);
      }
    }

    for (const key in sectionTimeMap) {
      if (sectionTimeMap[key].length > 1) {
        const uniqueSessions = new Set(sectionTimeMap[key]);
        if (uniqueSessions.size > 1) {
          sectionClashes += (uniqueSessions.size - 1);
        }
      }
    }

    // Evaluate course day distribution spacing
    for (const courseId in courseDayMap) {
      const days = courseDayMap[courseId];
      if (days.length > 1) {
        const uniqueDays = new Set(days);
        const duplicateDaysCount = days.length - uniqueDays.size;
        distributionViolations += duplicateDaysCount * 5; // Moderate penalty

        const sortedDays = Array.from(uniqueDays).sort((a, b) => a - b);
        for (let i = 0; i < sortedDays.length - 1; i++) {
          if (sortedDays[i+1] - sortedDays[i] === 1) {
            distributionViolations += 1; // Mild consecutive day penalty
          }
        }
      }
    }

    // Evaluate gaps in student timetables
    for (const sdKey in sectionDays) {
      const activeSlots = sectionDays[sdKey];
      if (activeSlots.length > 1) {
        const minSlot = Math.min(...activeSlots);
        const maxSlot = Math.max(...activeSlots);
        for (let slot = minSlot; slot <= maxSlot; slot++) {
          if (!activeSlots.includes(slot) && slot !== 10) { // Don't penalize Lunch Break gap
            studentGapsCount++;
          }
        }
      }
    }

    // Evaluate gaps in teacher timetables and max consecutive periods
    for (const tdKey in teacherDays) {
      const activeSlots = teacherDays[tdKey];
      if (activeSlots.length > 1) {
        const minSlot = Math.min(...activeSlots);
        const maxSlot = Math.max(...activeSlots);
        for (let slot = minSlot; slot <= maxSlot; slot++) {
          if (!activeSlots.includes(slot) && slot !== 10) { // Don't penalize Lunch Break gap
            teacherGapsCount++;
          }
        }

        const sortedSlots = [...activeSlots].sort((a, b) => a - b);
        let consecutive = 1;
        let maxConsecutive = 1;
        for (let i = 0; i < sortedSlots.length - 1; i++) {
          if (sortedSlots[i+1] - sortedSlots[i] === 1) {
            consecutive++;
            maxConsecutive = Math.max(maxConsecutive, consecutive);
          } else {
            consecutive = 1;
          }
        }
        if (maxConsecutive > 6) { // Labs are 6 periods (3h), so only penalize above 6
          teacherMaxHoursViolations += (maxConsecutive - 6);
        }
      }
    }

    // Calculate overall penalties
    hardPenalty += teacherClashes * 1000;
    hardPenalty += roomClashes * 1000;
    hardPenalty += sectionClashes * 1000;
    hardPenalty += roomCapacityViolations * 500;
    hardPenalty += teacherAvailabilityViolations * 500;
    hardPenalty += roomAvailabilityViolations * 500;

    softPenalty += studentGapsCount * 12;
    softPenalty += teacherGapsCount * 6;
    softPenalty += teacherMaxHoursViolations * 25;
    softPenalty += distributionViolations * 15;

    individual.hardConflicts = teacherClashes + roomClashes + sectionClashes + roomCapacityViolations + teacherAvailabilityViolations + roomAvailabilityViolations;
    individual.softConflicts = studentGapsCount + teacherGapsCount + teacherMaxHoursViolations + Math.round(distributionViolations / 5);
    individual.fitness = hardPenalty + softPenalty;
    individual.breakdown = {
      teacherClashes,
      roomClashes,
      sectionClashes,
      roomCapacityViolations,
      teacherAvailabilityViolations,
      roomAvailabilityViolations,
      studentGapsCount,
      teacherGapsCount,
      teacherMaxHoursViolations,
      distributionViolations
    };
  }
}
