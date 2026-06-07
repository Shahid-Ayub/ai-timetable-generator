// Main Application Controller for SchedulerAI
import { DB } from "./db.js";
import * as Scheduler from "./scheduler.js";
import * as Parser from "./parser.js";
import { Copilot, fetchEnv } from "./copilot.js";

// Initialize Database Instance
const db = new DB();

// State for active view and modal editing
let currentView = "dashboard";
let selectedTeacherIdForAvail = null;
let selectedRoomIdForAvail = null;
let draggedSessionId = null;

// Copilot Instance
let copilot = null;

// Importer Step State
let parsedRawText = "";
let parsedCsvRows = [];
let detectedSessionsList = [];

// Initialize Page
document.addEventListener("DOMContentLoaded", async () => {
  // Initialize Theme (Google Light Theme default / persistent dark theme)
  const themeToggleBtn = document.getElementById("btn-theme-toggle");
  if (themeToggleBtn) {
    const currentTheme = localStorage.getItem("theme") || "light";
    if (currentTheme === "dark") {
      document.body.classList.add("dark-theme");
      themeToggleBtn.innerHTML = `<i data-lucide="sun"></i>`;
    } else {
      document.body.classList.remove("dark-theme");
      themeToggleBtn.innerHTML = `<i data-lucide="moon"></i>`;
    }

    themeToggleBtn.addEventListener("click", () => {
      if (document.body.classList.contains("dark-theme")) {
        document.body.classList.remove("dark-theme");
        localStorage.setItem("theme", "light");
        themeToggleBtn.innerHTML = `<i data-lucide="moon"></i>`;
      } else {
        document.body.classList.add("dark-theme");
        localStorage.setItem("theme", "dark");
        themeToggleBtn.innerHTML = `<i data-lucide="sun"></i>`;
      }
      lucide.createIcons();
    });
  }

  // Navigation Bindings
  const navButtons = document.querySelectorAll(".nav-btn");
  navButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      const view = btn.getAttribute("data-view");
      switchView(view);
    });
  });

  // Modal Close Bindings
  const closeButtons = document.querySelectorAll(".modal-close, button[data-modal]");
  closeButtons.forEach(btn => {
    btn.addEventListener("click", (e) => {
      const modalId = btn.getAttribute("data-modal") || e.target.closest(".modal").id;
      closeModal(modalId);
    });
  });

  // Initialize Elements & Render Lists
  lucide.createIcons();
  updateDashboardStats();
  renderTeachersList();
  renderCoursesList();
  renderRoomsList();
  renderSectionsList();
  initFormSelects();
  initImporter();
  initSchedulerControls();
  initTimetableControls();
  runConflictAudit();

  // Initialize Copilot Instance
  const env = await fetchEnv();
  copilot = new Copilot(db, {
    onMutation: (actionType) => {
      updateDashboardStats();
      renderTeachersList();
      renderCoursesList();
      renderRoomsList();
      renderSectionsList();
      initFormSelects();
      if (currentView === "schedule") {
        renderScheduleGrid();
      }
      runConflictAudit();
    },
    onRunSolver: () => {
      const btn = document.getElementById("btn-dashboard-start-generate");
      if (btn) btn.click();
    },
    onSwitchView: (viewName) => {
      switchView(viewName);
    }
  });

  initCopilotChat();

  // Reset/Clear Buttons
  document.getElementById("btn-load-presets").addEventListener("click", () => {
    if (confirm("Are you sure you want to restore default university datasets? This will overwrite your current configurations.")) {
      db.resetToPresets();
      window.location.reload();
    }
  });

  document.getElementById("btn-clear-db").addEventListener("click", () => {
    if (confirm("Are you sure you want to wipe all records? This action cannot be undone.")) {
      db.resetToEmpty();
      window.location.reload();
    }
  });
});

// ================= VIEW NAVIGATION ================= //
function switchView(viewName) {
  currentView = viewName;

  // Update sidebar active button
  const navButtons = document.querySelectorAll(".nav-btn");
  navButtons.forEach(btn => {
    if (btn.getAttribute("data-view") === viewName) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });

  // Hide all view panels
  const viewPanels = document.querySelectorAll(".view-panel");
  viewPanels.forEach(panel => {
    panel.classList.remove("active");
  });

  // Show selected view panel
  const activePanel = document.getElementById(`view-${viewName}`);
  if (activePanel) {
    activePanel.classList.add("active");
  }

  // Update Topbar Title / Header
  const title = document.getElementById("page-title-text");
  const subtitle = document.getElementById("page-subtitle-text");

  if (viewName === "dashboard") {
    title.textContent = "Dashboard Summary";
    subtitle.textContent = "System performance and coordination overview";
    updateDashboardStats();
  } else if (viewName === "teachers") {
    title.textContent = "Faculty Instructors";
    subtitle.textContent = "Manage profiles, teaching loads, and weekly availability constraints";
    renderTeachersList();
  } else if (viewName === "courses") {
    title.textContent = "Course Catalog";
    subtitle.textContent = "Configure curriculum courses, sections allocations, and session loads";
    renderCoursesList();
  } else if (viewName === "rooms") {
    title.textContent = "Campus Classrooms";
    subtitle.textContent = "Manage lecture halls, laboratory spaces, and reservation schedules";
    renderRoomsList();
  } else if (viewName === "sections") {
    title.textContent = "Student Batches";
    subtitle.textContent = "Manage class sections, enrollments, and program structures";
    renderSectionsList();
  } else if (viewName === "importer") {
    title.textContent = "Timetable Document Importer";
    subtitle.textContent = "Upload spreadsheet CSVs, PDF timetables, or captured schedule photos";
  } else if (viewName === "schedule") {
    title.textContent = "Interactive Timetable Board";
    subtitle.textContent = "View visual calendars and drag & drop classes to adjust schedules";
    renderScheduleGrid();
  } else if (viewName === "logs") {
    title.textContent = "Constraint Audit logs";
    subtitle.textContent = "Real-time compliance validation checking for structural overlap conflicts";
    runConflictAudit();
  }

  // Refresh Lucide Icons
  lucide.createIcons();
}

// ================= MODAL CONTROLLER ================= //
function openModal(modalId) {
  document.getElementById("modal-backdrop").style.display = "block";
  document.getElementById(modalId).style.display = "flex";
}

function closeModal(modalId) {
  document.getElementById("modal-backdrop").style.display = "none";
  document.getElementById(modalId).style.display = "none";
  // Reset forms on close
  const form = document.querySelector(`#${modalId} form`);
  if (form) form.reset();
}

// Initialize dynamic drop-downs across forms
function initFormSelects() {
  // Course Teacher Select
  const teacherSelect = document.getElementById("course-form-teacher");
  if (teacherSelect) {
    teacherSelect.innerHTML = `<option value="">-- Choose Instructor --</option>`;
    db.getAll("teachers").forEach(t => {
      teacherSelect.innerHTML += `<option value="${t.id}">${t.name}</option>`;
    });
  }

  // Session Form Selects
  const sessCourse = document.getElementById("session-form-course");
  if (sessCourse) {
    sessCourse.innerHTML = `<option value="">-- Choose Course --</option>`;
    db.getAll("courses").forEach(c => {
      sessCourse.innerHTML += `<option value="${c.id}">${c.code} - ${c.name}</option>`;
    });
  }

  const sessRoom = document.getElementById("session-form-room");
  if (sessRoom) {
    sessRoom.innerHTML = `<option value="">-- Choose Room --</option>`;
    db.getAll("rooms").forEach(r => {
      sessRoom.innerHTML += `<option value="${r.id}">${r.name} (${r.type})</option>`;
    });
  }

  const sessDay = document.getElementById("session-form-day");
  if (sessDay) {
    sessDay.innerHTML = "";
    db.timeSettings.days.forEach((day, index) => {
      sessDay.innerHTML += `<option value="${index}">${day}</option>`;
    });
  }

  const sessSlot = document.getElementById("session-form-slot");
  if (sessSlot) {
    sessSlot.innerHTML = "";
    db.timeSettings.slotTimes.forEach((time, index) => {
      sessSlot.innerHTML += `<option value="${index}">Period ${index + 1} (${time})</option>`;
    });
  }
}

// ================= DASHBOARD CONTROLS ================= //
function updateDashboardStats() {
  document.getElementById("stat-teachers-count").textContent = db.getAll("teachers").length;
  document.getElementById("stat-courses-count").textContent = db.getAll("courses").length;
  document.getElementById("stat-rooms-count").textContent = db.getAll("rooms").length;
  document.getElementById("stat-sections-count").textContent = db.getAll("sections").length;

  const activeSchedule = db.getActiveSchedule();
  const noScheduleCard = document.getElementById("no-active-schedule-card");
  const activeScheduleCard = document.getElementById("active-schedule-card");
  const viewCalBtn = document.getElementById("btn-dashboard-view-schedule");
  const headerStatusDot = document.getElementById("header-status-dot");
  const headerStatusText = document.getElementById("header-status-text");

  if (activeSchedule) {
    noScheduleCard.style.display = "none";
    activeScheduleCard.style.display = "flex";
    viewCalBtn.style.display = "inline-flex";

    // Run synchronous conflict check to show fitness and compliance
    const audit = Scheduler.checkConflicts(activeSchedule.sessions, db);
    const hardCount = audit.conflicts.length;
    const softCount = audit.warnings.length;

    // Render Stats
    document.getElementById("active-summary-sessions").textContent = activeSchedule.sessions.length;

    // Fitness estimate formula: 100 - penalties
    let fitnessPercentage = 100 - (hardCount * 15) - (softCount * 2);
    fitnessPercentage = Math.max(0, Math.min(100, fitnessPercentage));

    const fitnessText = document.getElementById("active-summary-fitness");
    fitnessText.textContent = `${fitnessPercentage}%`;

    if (fitnessPercentage >= 95) {
      fitnessText.className = "metric-val text-success";
      headerStatusDot.className = "status-indicator-dot active";
      headerStatusText.textContent = `Schedule Optimal (${fitnessPercentage}%)`;
    } else if (fitnessPercentage >= 75) {
      fitnessText.className = "metric-val text-warning";
      headerStatusDot.className = "status-indicator-dot warning";
      headerStatusText.textContent = `Schedule Warning (${hardCount} conflicts)`;
    } else {
      fitnessText.className = "metric-val text-danger";
      headerStatusDot.className = "status-indicator-dot danger";
      headerStatusText.textContent = `Schedule Critical (${hardCount} conflicts)`;
    }

    // Set Heuristic Breakdowns
    const teacherAvailViolations = audit.conflicts.filter(c => c.type === "teacher_unavailability").length;
    const capacityViolations = audit.conflicts.filter(c => c.type === "room_capacity").length;
    const typeViolations = audit.conflicts.filter(c => c.type === "room_type_mismatch").length;
    const gapViolations = audit.warnings.filter(w => w.type === "consecutive_hours").length;

    document.getElementById("comp-teacher-avail").innerHTML = teacherAvailViolations === 0
      ? `<span class="text-success"><i data-lucide="check" style="width:14px;height:14px;"></i> Clear</span>`
      : `<span class="text-danger">${teacherAvailViolations} Violations</span>`;

    document.getElementById("comp-room-cap").innerHTML = capacityViolations === 0
      ? `<span class="text-success"><i data-lucide="check" style="width:14px;height:14px;"></i> Fitting</span>`
      : `<span class="text-danger">${capacityViolations} Overflows</span>`;

    document.getElementById("comp-room-type").innerHTML = typeViolations === 0
      ? `<span class="text-success"><i data-lucide="check" style="width:14px;height:14px;"></i> Aligned</span>`
      : `<span class="text-danger">${typeViolations} Mismatches</span>`;

    const gapText = document.getElementById("comp-student-gaps");
    if (gapViolations === 0) {
      gapText.innerHTML = `<span class="text-success">Optimal</span>`;
      document.getElementById("icon-student-gaps").innerHTML = `<i data-lucide="check" class="text-success"></i> Consecutive Blocks`;
    } else {
      gapText.innerHTML = `<span class="text-warning">${gapViolations} Warnings</span>`;
      document.getElementById("icon-student-gaps").innerHTML = `<i data-lucide="info" class="text-warning"></i> Faculty Fatigue`;
    }

    // Dynamic actions
    document.getElementById("btn-export-active-pdf").onclick = () => {
      switchView("schedule");
      exportSchedulePDF();
    };
    document.getElementById("btn-export-active-csv").onclick = () => exportScheduleCSV();
    document.getElementById("btn-export-active-tabular-csv").onclick = () => {
      switchView("schedule");
      exportScheduleTabularCSV();
    };
    document.getElementById("btn-export-active-json").onclick = () => downloadDatabaseBackup();
    document.getElementById("btn-dashboard-view-schedule").onclick = () => switchView("schedule");

    lucide.createIcons();
  } else {
    noScheduleCard.style.display = "flex";
    activeScheduleCard.style.display = "none";
    viewCalBtn.style.display = "none";
    headerStatusDot.className = "status-indicator-dot";
    headerStatusText.textContent = "No active schedule";
  }
}

// ================= TEACHERS SECTION ================= //
function renderTeachersList() {
  const tbody = document.getElementById("table-body-teachers");
  tbody.innerHTML = "";

  const searchVal = document.getElementById("search-teachers").value.toLowerCase();
  const teachers = db.getAll("teachers").filter(t =>
    t.name.toLowerCase().includes(searchVal) || t.email.toLowerCase().includes(searchVal)
  );

  teachers.forEach(t => {
    const row = document.createElement("tr");
    row.style.cursor = "pointer";
    row.innerHTML = `
      <td><strong>${t.name}</strong></td>
      <td>${t.email}</td>
      <td>${t.maxHours} hrs/wk</td>
      <td class="actions-col">
        <div class="actions-cell-wrapper" onclick="event.stopPropagation();">
          <button class="btn-icon text-indigo btn-edit-teacher-trigger" data-id="${t.id}"><i data-lucide="edit"></i></button>
          <button class="btn-icon text-danger btn-delete-teacher-trigger" data-id="${t.id}"><i data-lucide="trash-2"></i></button>
        </div>
      </td>
    `;

    // Row click selection to view details/availability
    row.addEventListener("click", () => selectTeacherForAvailability(t.id));
    tbody.appendChild(row);
  });

  // Attach Action Handlers
  document.querySelectorAll(".btn-edit-teacher-trigger").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      const teacher = db.getById("teachers", id);
      if (teacher) {
        document.getElementById("teacher-form-id").value = teacher.id;
        document.getElementById("teacher-form-name").value = teacher.name;
        document.getElementById("teacher-form-email").value = teacher.email;
        document.getElementById("teacher-form-hours").value = teacher.maxHours;
        document.getElementById("modal-teacher-title").textContent = "Modify Instructor";
        openModal("modal-teacher");
      }
    });
  });

  document.querySelectorAll(".btn-delete-teacher-trigger").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      if (confirm("Are you sure you want to delete this instructor? This will clear their assignments from all courses.")) {
        db.delete("teachers", id);
        renderTeachersList();
        initFormSelects();
        if (selectedTeacherIdForAvail === id) {
          document.getElementById("teacher-detail-card").style.display = "none";
        }
      }
    });
  });

  lucide.createIcons();
}

function selectTeacherForAvailability(teacherId) {
  selectedTeacherIdForAvail = teacherId;
  const teacher = db.getById("teachers", teacherId);
  if (!teacher) return;

  document.getElementById("teacher-detail-name").textContent = teacher.name;
  document.getElementById("teacher-detail-card").style.display = "flex";

  renderAvailabilityGrid("teacher-availability-grid", teacher.availability, (dayIndex, slotIndex, currentVal) => {
    teacher.availability[dayIndex][slotIndex] = !currentVal;
    db.save();
    return teacher.availability[dayIndex][slotIndex];
  });
}

// Reusable availability matrix grid renderer
function renderAvailabilityGrid(containerId, matrix, onToggle) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";

  // 1. Column headers (Days)
  container.appendChild(document.createElement("div")); // Empty top-left cell
  db.timeSettings.days.forEach(day => {
    const header = document.createElement("div");
    header.className = "avail-header-cell";
    header.textContent = day.substring(0, 3);
    container.appendChild(header);
  });

  // 2. Grid Rows (Slots)
  for (let s = 0; s < db.timeSettings.slotsPerDay; s++) {
    // Slot label
    const rowLabel = document.createElement("div");
    rowLabel.className = "avail-label-cell";
    rowLabel.textContent = `Period ${s + 1}`;
    container.appendChild(rowLabel);

    // Days grid
    for (let d = 0; d < db.timeSettings.days.length; d++) {
      const cell = document.createElement("div");
      cell.className = "avail-slot-cell";

      const isAvailable = matrix[d][s];
      if (!isAvailable) {
        cell.classList.add("unavailable");
      }

      cell.title = `Period ${s + 1} on ${db.timeSettings.days[d]}: ${isAvailable ? 'Available' : 'Unavailable'}`;

      cell.addEventListener("click", () => {
        const newVal = onToggle(d, s, isAvailable);
        if (newVal) {
          cell.classList.remove("unavailable");
          cell.title = `Period ${s + 1} on ${db.timeSettings.days[d]}: Available`;
        } else {
          cell.classList.add("unavailable");
          cell.title = `Period ${s + 1} on ${db.timeSettings.days[d]}: Unavailable`;
        }
      });
      container.appendChild(cell);
    }
  }
}

// Availability Helper Buttons
document.getElementById("btn-teacher-avail-all").addEventListener("click", () => {
  if (selectedTeacherIdForAvail) {
    const t = db.getById("teachers", selectedTeacherIdForAvail);
    t.availability = t.availability.map(row => row.fill(true));
    db.save();
    selectTeacherForAvailability(selectedTeacherIdForAvail);
  }
});
document.getElementById("btn-teacher-avail-none").addEventListener("click", () => {
  if (selectedTeacherIdForAvail) {
    const t = db.getById("teachers", selectedTeacherIdForAvail);
    t.availability = t.availability.map(row => row.fill(false));
    db.save();
    selectTeacherForAvailability(selectedTeacherIdForAvail);
  }
});

// Teacher Form Submission
document.getElementById("form-teacher").addEventListener("submit", (e) => {
  e.preventDefault();
  const id = document.getElementById("teacher-form-id").value;
  const name = document.getElementById("teacher-form-name").value;
  const email = document.getElementById("teacher-form-email").value;
  const maxHours = parseInt(document.getElementById("teacher-form-hours").value);

  if (id) {
    db.update("teachers", id, { name, email, maxHours });
  } else {
    db.add("teachers", {
      name,
      email,
      maxHours,
      availability: Array.from({ length: db.timeSettings.days.length }, () => new Array(db.timeSettings.slotsPerDay).fill(true))
    });
  }

  closeModal("modal-teacher");
  renderTeachersList();
  initFormSelects();
});

document.getElementById("btn-add-teacher").addEventListener("click", () => {
  document.getElementById("teacher-form-id").value = "";
  document.getElementById("modal-teacher-title").textContent = "Register Instructor";
  openModal("modal-teacher");
});

document.getElementById("search-teachers").addEventListener("input", renderTeachersList);


// ================= ROOMS SECTION ================= //
function renderRoomsList() {
  const tbody = document.getElementById("table-body-rooms");
  tbody.innerHTML = "";

  const searchVal = document.getElementById("search-rooms").value.toLowerCase();
  const rooms = db.getAll("rooms").filter(r => r.name.toLowerCase().includes(searchVal));

  rooms.forEach(r => {
    const row = document.createElement("tr");
    row.style.cursor = "pointer";
    row.innerHTML = `
      <td><strong>${r.name}</strong></td>
      <td><span class="pill-section">${r.type === "lecture" ? 'Classroom' : 'Laboratory'}</span></td>
      <td>${r.capacity} students</td>
      <td class="actions-col">
        <div class="actions-cell-wrapper" onclick="event.stopPropagation();">
          <button class="btn-icon text-indigo btn-edit-room-trigger" data-id="${r.id}"><i data-lucide="edit"></i></button>
          <button class="btn-icon text-danger btn-delete-room-trigger" data-id="${r.id}"><i data-lucide="trash-2"></i></button>
        </div>
      </td>
    `;
    row.addEventListener("click", () => selectRoomForAvailability(r.id));
    tbody.appendChild(row);
  });

  // Bind Actions
  document.querySelectorAll(".btn-edit-room-trigger").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      const r = db.getById("rooms", id);
      if (r) {
        document.getElementById("room-form-id").value = r.id;
        document.getElementById("room-form-name").value = r.name;
        document.getElementById("room-form-type").value = r.type;
        document.getElementById("room-form-capacity").value = r.capacity;
        document.getElementById("modal-room-title").textContent = "Modify Room";
        openModal("modal-room");
      }
    });
  });

  document.querySelectorAll(".btn-delete-room-trigger").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      if (confirm("Are you sure you want to delete this room?")) {
        db.delete("rooms", id);
        renderRoomsList();
        initFormSelects();
        if (selectedRoomIdForAvail === id) {
          document.getElementById("room-detail-card").style.display = "none";
        }
      }
    });
  });

  lucide.createIcons();
}

function selectRoomForAvailability(roomId) {
  selectedRoomIdForAvail = roomId;
  const room = db.getById("rooms", roomId);
  if (!room) return;

  document.getElementById("room-detail-name").textContent = room.name;
  document.getElementById("room-detail-card").style.display = "flex";

  renderAvailabilityGrid("room-availability-grid", room.availability, (dayIndex, slotIndex, currentVal) => {
    room.availability[dayIndex][slotIndex] = !currentVal;
    db.save();
    return room.availability[dayIndex][slotIndex];
  });
}

// Availability controls for Room
document.getElementById("btn-room-avail-all").addEventListener("click", () => {
  if (selectedRoomIdForAvail) {
    const r = db.getById("rooms", selectedRoomIdForAvail);
    r.availability = r.availability.map(row => row.fill(true));
    db.save();
    selectRoomForAvailability(selectedRoomIdForAvail);
  }
});
document.getElementById("btn-room-avail-none").addEventListener("click", () => {
  if (selectedRoomIdForAvail) {
    const r = db.getById("rooms", selectedRoomIdForAvail);
    r.availability = r.availability.map(row => row.fill(false));
    db.save();
    selectRoomForAvailability(selectedRoomIdForAvail);
  }
});

// Room Form Submission
document.getElementById("form-room").addEventListener("submit", (e) => {
  e.preventDefault();
  const id = document.getElementById("room-form-id").value;
  const name = document.getElementById("room-form-name").value;
  const type = document.getElementById("room-form-type").value;
  const capacity = parseInt(document.getElementById("room-form-capacity").value);

  if (id) {
    db.update("rooms", id, { name, type, capacity });
  } else {
    db.add("rooms", {
      name,
      type,
      capacity,
      availability: Array.from({ length: db.timeSettings.days.length }, () => new Array(db.timeSettings.slotsPerDay).fill(true))
    });
  }

  closeModal("modal-room");
  renderRoomsList();
  initFormSelects();
});

document.getElementById("btn-add-room").addEventListener("click", () => {
  document.getElementById("room-form-id").value = "";
  document.getElementById("modal-room-title").textContent = "Register Classroom";
  openModal("modal-room");
});

document.getElementById("search-rooms").addEventListener("input", renderRoomsList);


// ================= SECTIONS SECTION ================= //
function generateSectionNamePreview() {
  const dept = document.getElementById("section-form-dept").value;
  const semester = document.getElementById("section-form-semester").value;
  const field = document.getElementById("section-form-field").value;
  const letter = document.getElementById("section-form-letter").value;

  let code = "";
  if (dept === "Computer Science") {
    if (field === "General") {
      code = `BSCS-${semester}${letter}`;
    } else {
      code = `BS-${field}-${semester}${letter}`;
    }
  } else if (dept === "Electrical Engineering") {
    if (field === "General") {
      code = `BSEE-${semester}${letter}`;
    } else {
      code = `BSEE-${semester}${letter}-${field}`;
    }
  } else if (dept === "Mechanical Engineering") {
    code = `BSME-${semester}${letter}`;
  } else if (dept === "Civil Engineering") {
    code = `BSCE-${semester}${letter}`;
  } else if (dept === "Software Engineering") {
    code = `BSSE-${semester}${letter}`;
  } else {
    code = `SEC-${semester}${letter}`;
  }

  // Strip trailing spaces or hyphens if letter/field is empty
  code = code.replace(/-+$/, "");

  document.getElementById("section-form-name").value = code;
}

function renderSectionsList() {
  const tbody = document.getElementById("table-body-sections");
  tbody.innerHTML = "";

  const searchVal = document.getElementById("search-sections").value.toLowerCase();
  const sections = db.getAll("sections").filter(s =>
    s.name.toLowerCase().includes(searchVal) ||
    (s.department || s.program || "").toLowerCase().includes(searchVal)
  );

  sections.forEach(s => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td><strong>${s.name}</strong></td>
      <td>${s.department || s.program || "Computer Science"}</td>
      <td>Batch ${s.batchYear || "N/A"} / ${s.field || "General"}</td>
      <td>Semester ${s.semester}</td>
      <td>${s.size} students</td>
      <td class="actions-col">
        <div class="actions-cell-wrapper">
          <button class="btn-icon text-indigo btn-edit-section-trigger" data-id="${s.id}"><i data-lucide="edit"></i></button>
          <button class="btn-icon text-danger btn-delete-section-trigger" data-id="${s.id}"><i data-lucide="trash-2"></i></button>
        </div>
      </td>
    `;
    tbody.appendChild(row);
  });

  // Action Buttons
  document.querySelectorAll(".btn-edit-section-trigger").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      const s = db.getById("sections", id);
      if (s) {
        document.getElementById("section-form-id").value = s.id;
        document.getElementById("section-form-dept").value = s.department || "Computer Science";
        document.getElementById("section-form-batch").value = s.batchYear || 2024;
        document.getElementById("section-form-semester").value = s.semester || 1;
        document.getElementById("section-form-field").value = s.field || "General";
        document.getElementById("section-form-letter").value = s.section || "";
        document.getElementById("section-form-size").value = s.size;
        document.getElementById("section-form-name").value = s.name;
        document.getElementById("modal-section-title").textContent = "Modify Student Batch";
        openModal("modal-section");
      }
    });
  });

  document.querySelectorAll(".btn-delete-section-trigger").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      if (confirm("Are you sure you want to delete this class section?")) {
        db.delete("sections", id);
        renderSectionsList();
        initFormSelects();
      }
    });
  });

  lucide.createIcons();
}

// Section Form Submission
document.getElementById("form-section").addEventListener("submit", (e) => {
  e.preventDefault();
  const id = document.getElementById("section-form-id").value;
  const department = document.getElementById("section-form-dept").value;
  const batchYear = parseInt(document.getElementById("section-form-batch").value);
  const semester = parseInt(document.getElementById("section-form-semester").value);
  const field = document.getElementById("section-form-field").value;
  const section = document.getElementById("section-form-letter").value;
  const size = parseInt(document.getElementById("section-form-size").value);
  const name = document.getElementById("section-form-name").value;

  const program = department; // backwards compatibility

  const sectionData = { name, size, program, semester, department, batchYear, field, section };

  if (id) {
    db.update("sections", id, sectionData);
  } else {
    db.add("sections", sectionData);
  }

  closeModal("modal-section");
  renderSectionsList();
  initFormSelects();
});

document.getElementById("btn-add-section").addEventListener("click", () => {
  document.getElementById("section-form-id").value = "";
  document.getElementById("section-form-dept").value = "Computer Science";
  document.getElementById("section-form-batch").value = new Date().getFullYear() - 1; // 2025
  document.getElementById("section-form-semester").value = "1";
  document.getElementById("section-form-field").value = "General";
  document.getElementById("section-form-letter").value = "A";
  document.getElementById("section-form-size").value = 40;
  generateSectionNamePreview();
  document.getElementById("modal-section-title").textContent = "Register Class Section";
  openModal("modal-section");
});

// Attach preview update listeners
["section-form-dept", "section-form-batch", "section-form-semester", "section-form-field", "section-form-letter"].forEach(id => {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener("change", generateSectionNamePreview);
    el.addEventListener("input", generateSectionNamePreview);
  }
});

document.getElementById("search-sections").addEventListener("input", renderSectionsList);


// ================= COURSES SECTION ================= //
function renderCoursesList() {
  const tbody = document.getElementById("table-body-courses");
  tbody.innerHTML = "";

  const searchVal = document.getElementById("search-courses").value.toLowerCase();
  const courses = db.getAll("courses").filter(c =>
    c.code.toLowerCase().includes(searchVal) || c.name.toLowerCase().includes(searchVal)
  );

  courses.forEach(c => {
    const teacher = db.getById("teachers", c.teacherId);

    // Resolve section names
    const sectionsText = c.sectionIds.map(sid => {
      const s = db.getById("sections", sid);
      return s ? `<span class="pill-section">${s.name}</span>` : "";
    }).join(" ");

    const row = document.createElement("tr");
    row.innerHTML = `
      <td><strong>${c.code}</strong></td>
      <td>${c.name}</td>
      <td>${c.sessionsPerWeek} classes/wk</td>
      <td><span class="pill-section">${c.roomType === "lecture" ? 'Classroom' : 'Laboratory'}</span></td>
      <td>${teacher ? teacher.name : '<span class="text-danger">Unassigned</span>'}</td>
      <td>${sectionsText || '<span class="text-danger">None Allocated</span>'}</td>
      <td class="actions-col">
        <div class="actions-cell-wrapper">
          <button class="btn-icon text-indigo btn-edit-course-trigger" data-id="${c.id}"><i data-lucide="edit"></i></button>
          <button class="btn-icon text-danger btn-delete-course-trigger" data-id="${c.id}"><i data-lucide="trash-2"></i></button>
        </div>
      </td>
    `;
    tbody.appendChild(row);
  });

  // Action Bindings
  document.querySelectorAll(".btn-edit-course-trigger").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      const c = db.getById("courses", id);
      if (c) {
        document.getElementById("course-form-id").value = c.id;
        document.getElementById("course-form-code").value = c.code;
        document.getElementById("course-form-name").value = c.name;
        document.getElementById("course-form-sessions").value = c.sessionsPerWeek;
        document.getElementById("course-form-roomtype").value = c.roomType;
        document.getElementById("course-form-teacher").value = c.teacherId;

        // Build Section Checkboxes with checked values
        buildCourseSectionCheckboxes(c.sectionIds);

        document.getElementById("modal-course-title").textContent = "Modify Course Details";
        openModal("modal-course");
      }
    });
  });

  document.querySelectorAll(".btn-delete-course-trigger").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      if (confirm("Are you sure you want to delete this course?")) {
        db.delete("courses", id);
        renderCoursesList();
        initFormSelects();
      }
    });
  });

  lucide.createIcons();
}

function buildCourseSectionCheckboxes(checkedIds = []) {
  const container = document.getElementById("course-form-sections-checkboxes");
  container.innerHTML = "";

  db.getAll("sections").forEach(s => {
    const isChecked = checkedIds.includes(s.id);
    const label = document.createElement("label");
    label.className = "checkbox-item";
    label.innerHTML = `
      <input type="checkbox" name="course-sections" value="${s.id}" ${isChecked ? 'checked' : ''}>
      <span>${s.name} (${s.size})</span>
    `;
    container.appendChild(label);
  });
}

// Course Form Submission
document.getElementById("form-course").addEventListener("submit", (e) => {
  e.preventDefault();
  const id = document.getElementById("course-form-id").value;
  const code = document.getElementById("course-form-code").value;
  const name = document.getElementById("course-form-name").value;
  const sessionsPerWeek = parseInt(document.getElementById("course-form-sessions").value);
  const roomType = document.getElementById("course-form-roomtype").value;
  const teacherId = document.getElementById("course-form-teacher").value;

  // Extract checked section IDs
  const checkedBoxes = document.querySelectorAll("input[name='course-sections']:checked");
  const sectionIds = Array.from(checkedBoxes).map(box => box.value);

  const courseData = { code, name, sessionsPerWeek, roomType, teacherId, sectionIds };

  if (id) {
    db.update("courses", id, courseData);
  } else {
    db.add("courses", courseData);
  }

  closeModal("modal-course");
  renderCoursesList();
  initFormSelects();
});

document.getElementById("btn-add-course").addEventListener("click", () => {
  document.getElementById("course-form-id").value = "";
  buildCourseSectionCheckboxes([]);
  document.getElementById("modal-course-title").textContent = "Register Course";
  openModal("modal-course");
});

document.getElementById("search-courses").addEventListener("input", renderCoursesList);


// ================= AUTO SCHEDULER ORCHESTRATOR ================= //
function initSchedulerControls() {
  const btnHeader = document.getElementById("btn-header-generate");
  const btnDashStart = document.getElementById("btn-dashboard-start-generate");
  const btnDashStop = document.getElementById("btn-dashboard-stop-generate");

  const startSolver = () => {
    if (db.getAll("courses").length === 0) {
      alert("Please configure courses before scheduling.");
      return;
    }
    if (db.getAll("rooms").length === 0) {
      alert("Please configure classrooms/rooms before scheduling.");
      return;
    }

    // Toggle layouts to show progress
    document.getElementById("engine-idle-state").style.display = "none";
    document.getElementById("engine-running-state").style.display = "block";

    const engineBadge = document.getElementById("engine-badge-status");
    engineBadge.textContent = "SOLVING";
    engineBadge.className = "engine-badge solving";

    // Start Worker
    Scheduler.startScheduling(db, {
      onProgress: (payload) => {
        document.getElementById("run-stat-generation").textContent = `${payload.generation}/1200`;
        document.getElementById("run-stat-hard").textContent = payload.hardConflicts;
        document.getElementById("run-stat-soft").textContent = payload.softConflicts;
        document.getElementById("run-progress-fill").style.width = `${payload.progressPercentage}%`;
      },
      onSuccess: (payload) => {
        // Save Schedule to Database
        db.addSchedule({
          name: "Schedule " + new Date().toLocaleString(),
          sessions: payload.schedule,
          fitness: payload.fitness
        });

        alert("Success! Conflict-free timetable generated successfully.");

        // Reset engine card
        resetEngineCard();
        updateDashboardStats();
        switchView("schedule");
      },
      onFailure: (payload) => {
        alert(payload.error);
        if (payload.schedule) {
          // If solved partially, let user save it
          if (confirm("Would you like to import the partially solved schedule with conflicts? You can resolve them manually.")) {
            db.addSchedule({
              name: "Partial Schedule " + new Date().toLocaleString(),
              sessions: payload.schedule,
              fitness: payload.fitness || 0
            });
            resetEngineCard();
            updateDashboardStats();
            switchView("schedule");
            return;
          }
        }
        resetEngineCard();
        updateDashboardStats();
      }
    });
  };

  btnHeader.addEventListener("click", startSolver);
  btnDashStart.addEventListener("click", startSolver);

  btnDashStop.addEventListener("click", () => {
    Scheduler.stopScheduling();
    resetEngineCard();
    updateDashboardStats();
  });
}

function resetEngineCard() {
  document.getElementById("engine-idle-state").style.display = "block";
  document.getElementById("engine-running-state").style.display = "none";
  const badge = document.getElementById("engine-badge-status");
  badge.textContent = "IDLE";
  badge.className = "engine-badge";
  document.getElementById("run-progress-fill").style.width = "0%";
}


// ================= TIMETABLE BOARD (VISUAL CALENDAR) ================= //
function initTimetableControls() {
  const selectType = document.getElementById("select-schedule-view-type");
  const selectTarget = document.getElementById("select-schedule-view-target");

  // Helper to populate sections based on department filter
  function populateFilteredSections() {
    const deptFilter = document.getElementById("select-schedule-dept").value;
    selectTarget.innerHTML = "";
    const sections = db.getAll("sections").filter(s => {
      return deptFilter === "All" || s.department === deptFilter || s.program === deptFilter;
    });
    if (sections.length === 0) {
      selectTarget.innerHTML = `<option value="">No batches found</option>`;
    } else {
      sections.forEach(s => {
        selectTarget.innerHTML += `<option value="${s.id}">${s.name}</option>`;
      });
    }
    renderScheduleGrid();
  }

  // Filter View Type Change
  selectType.addEventListener("change", () => {
    const val = selectType.value;
    const label = document.getElementById("label-filter-target");
    const deptWrapper = document.getElementById("filter-dept-wrapper");

    // Clear and populate targets
    selectTarget.innerHTML = "";

    if (val === "section") {
      label.textContent = "Select Batch";
      deptWrapper.style.display = "flex";
      populateFilteredSections();
    } else {
      deptWrapper.style.display = "none";
      if (val === "teacher") {
        label.textContent = "Select Instructor";
        db.getAll("teachers").forEach(t => {
          selectTarget.innerHTML += `<option value="${t.id}">${t.name}</option>`;
        });
      } else if (val === "room") {
        label.textContent = "Select Room";
        db.getAll("rooms").forEach(r => {
          selectTarget.innerHTML += `<option value="${r.id}">${r.name} (${r.type})</option>`;
        });
      }
      renderScheduleGrid();
    }
  });

  // Department filter selection change
  document.getElementById("select-schedule-dept").addEventListener("change", populateFilteredSections);

  // Filter Selection Change
  selectTarget.addEventListener("change", renderScheduleGrid);

  // Trigger initial dropdown population
  selectType.dispatchEvent(new Event("change"));

  // Print schedule button
  document.getElementById("btn-print-schedule").addEventListener("click", () => {
    window.print();
  });

  // Export PDF button
  document.getElementById("btn-export-pdf").addEventListener("click", exportSchedulePDF);

  // Export List PDF button
  document.getElementById("btn-export-csv").addEventListener("click", exportScheduleListPDF);

  // Add Session Manual Trigger
  document.getElementById("btn-add-session-manual").addEventListener("click", () => {
    document.getElementById("session-form-id").value = "";
    document.getElementById("btn-session-delete").style.display = "none";
    document.getElementById("session-clash-warning").style.display = "none";
    openModal("modal-session");
  });

  // Submit Manual/Edit Session Form
  document.getElementById("form-session").addEventListener("submit", (e) => {
    e.preventDefault();
    const activeSchedule = db.getActiveSchedule();
    if (!activeSchedule) {
      alert("No active timetable schedule found. Please generate or import a timetable first.");
      return;
    }

    const id = document.getElementById("session-form-id").value;
    const courseId = document.getElementById("session-form-course").value;
    const roomId = document.getElementById("session-form-room").value;
    const day = parseInt(document.getElementById("session-form-day").value);
    const slot = parseInt(document.getElementById("session-form-slot").value);

    const course = db.getById("courses", courseId);
    if (!course) return;

    const newSession = {
      id: id || "sess_" + Math.random().toString(36).substr(2, 9),
      courseId,
      courseCode: course.code,
      courseName: course.name,
      teacherId: course.teacherId,
      sectionIds: course.sectionIds,
      roomId,
      day,
      slot
    };

    if (id) {
      // Edit
      const index = activeSchedule.sessions.findIndex(s => s.id === id);
      if (index !== -1) {
        activeSchedule.sessions[index] = newSession;
      }
    } else {
      // Add
      activeSchedule.sessions.push(newSession);
    }

    db.save();
    closeModal("modal-session");
    renderScheduleGrid();
    runConflictAudit();
  });

  // Delete session handler from within modal
  document.getElementById("btn-session-delete").addEventListener("click", () => {
    const activeSchedule = db.getActiveSchedule();
    const id = document.getElementById("session-form-id").value;
    if (activeSchedule && id) {
      activeSchedule.sessions = activeSchedule.sessions.filter(s => s.id !== id);
      db.save();
      closeModal("modal-session");
      renderScheduleGrid();
      runConflictAudit();
    }
  });
}

function renderScheduleGrid() {
  const grid = document.getElementById("main-timetable-grid");
  grid.innerHTML = "";

  const activeSchedule = db.getActiveSchedule();
  if (!activeSchedule) {
    grid.innerHTML = `<div class="empty-state" style="grid-column: span 16;"><i data-lucide="calendar-x" class="empty-icon"></i><h4>No Active Timetable Calendar</h4><p>Run the auto-scheduler engine or load presets to construct your visual board.</p></div>`;
    lucide.createIcons();
    return;
  }

  const viewType = document.getElementById("select-schedule-view-type").value;
  const targetId = document.getElementById("select-schedule-view-target").value;

  if (!targetId) {
    grid.innerHTML = `<div class="empty-state" style="grid-column: span 16;"><p>Configure elements in the database first to view corresponding grid timetables.</p></div>`;
    return;
  }

  // Filter sessions that belong to the active visual target
  const filteredSessions = activeSchedule.sessions.filter(sess => {
    if (viewType === "section") {
      return sess.sectionIds && sess.sectionIds.includes(targetId);
    } else if (viewType === "teacher") {
      return sess.teacherId === targetId;
    } else if (viewType === "room") {
      return sess.roomId === targetId;
    }
    return false;
  });

  // Check conflicts for warnings overlays
  const audit = Scheduler.checkConflicts(activeSchedule.sessions, db);
  const clashingSessionIds = new Set();
  audit.conflicts.forEach(c => {
    if (c.sessions) {
      c.sessions.forEach(s => clashingSessionIds.add(s.id));
    }
  });

  // --- RENDERING CELL GRID ---
  // 1. Column headers (Timeslots)
  const emptyCorner = document.createElement("div");
  emptyCorner.className = "timetable-cell-header";
  emptyCorner.style.gridColumn = "1";
  emptyCorner.style.gridRow = "1";
  emptyCorner.innerHTML = `<strong>Day \\ Period</strong>`;
  grid.appendChild(emptyCorner);

  for (let s = 0; s < db.timeSettings.slotsPerDay; s++) {
    const colHeader = document.createElement("div");
    colHeader.className = "timetable-cell-header";
    colHeader.style.gridColumn = `${s + 2}`;
    colHeader.style.gridRow = "1";

    // Period number and slot time
    const timeStr = db.timeSettings.slotTimes[s];
    colHeader.innerHTML = `
      <span class="time-lbl-period">S-${s + 1}</span>
      <span class="time-lbl-val" style="font-size: 0.7rem; white-space: nowrap;">${timeStr.split(" (")[1]?.replace(")", "") || timeStr}</span>
    `;
    grid.appendChild(colHeader);
  }

  // Render the locked Lunch & Prayer Break column spanning rows 2 to 6
  const lunchBreak = document.createElement("div");
  lunchBreak.className = "lunch-break-cell";
  lunchBreak.style.gridColumn = "12";
  lunchBreak.style.gridRow = "2 / span 5";
  lunchBreak.innerHTML = `<span>LUNCH & PRAYER BREAK (S-11)</span>`;
  grid.appendChild(lunchBreak);

  // 2. Day rows & slot cells
  for (let d = 0; d < db.timeSettings.days.length; d++) {
    // Day Label (Column 1)
    const dayLabel = document.createElement("div");
    dayLabel.className = "timetable-cell-time-lbl";
    dayLabel.style.gridColumn = "1";
    dayLabel.style.gridRow = `${d + 2}`;
    dayLabel.innerHTML = `
      <span class="time-lbl-val">${db.timeSettings.days[d]}</span>
    `;
    grid.appendChild(dayLabel);

    // Empty Slots (Columns 2 to 16)
    for (let s = 0; s < db.timeSettings.slotsPerDay; s++) {
      // Skip rendering empty slot cell for Lunch Break (slot index 10) since it's locked
      if (s === 10) continue;

      const slotCell = document.createElement("div");
      slotCell.className = "timetable-slot-cell";
      slotCell.style.gridColumn = `${s + 2}`;
      slotCell.style.gridRow = `${d + 2}`;
      slotCell.setAttribute("data-day", d);
      slotCell.setAttribute("data-slot", s);

      // Droppable listeners for slot cell
      slotCell.addEventListener("dragover", (e) => {
        e.preventDefault();
        if (!draggedSessionId) return;

        // Perform synchronous clash audits for real-time visual feedback!
        const dragDay = d;
        const dragSlot = s;

        const auditScheduleCopy = JSON.parse(JSON.stringify(activeSchedule.sessions));
        const sessionToMove = auditScheduleCopy.find(sess => sess.id === draggedSessionId);

        if (sessionToMove) {
          sessionToMove.day = dragDay;
          sessionToMove.slot = dragSlot;

          // Run audit
          const check = Scheduler.checkConflicts(auditScheduleCopy, db);
          if (check.isValid) {
            slotCell.classList.add("drag-target-valid");
            slotCell.classList.remove("drag-target-invalid");
          } else {
            slotCell.classList.add("drag-target-invalid");
            slotCell.classList.remove("drag-target-valid");
          }
        }
      });

      slotCell.addEventListener("dragleave", () => {
        slotCell.classList.remove("drag-target-valid", "drag-target-invalid");
      });

      slotCell.addEventListener("drop", (e) => {
        e.preventDefault();
        const sessId = e.dataTransfer.getData("text/plain");
        if (sessId && activeSchedule) {
          const dropDay = d;
          const dropSlot = s;

          const sessToUpdate = activeSchedule.sessions.find(sess => sess.id === sessId);
          if (sessToUpdate) {
            sessToUpdate.day = dropDay;
            sessToUpdate.slot = dropSlot;

            db.save();
            renderScheduleGrid();
            runConflictAudit();
            updateDashboardStats();
          }
        }
      });

      grid.appendChild(slotCell);
    }
  }

  // 3. Render cards (overlaying slots)
  filteredSessions.forEach(sess => {
    if (sess.day === undefined || sess.slot === undefined) return;
    if (sess.slot === 10) return; // Skip if scheduled at locked slot 10

    const course = db.getById("courses", sess.courseId);
    const roomType = sess.roomType || (course ? course.roomType : "lecture");
    const spanVal = roomType === "lab" ? (sess.slot === 0 ? 6 : (sess.slot === 11 ? 4 : 6)) : 3;

    const card = document.createElement("div");
    card.className = `timetable-card-item room-type-${roomType}`;
    card.style.gridColumn = `${sess.slot + 2} / span ${spanVal}`;
    card.style.gridRow = `${sess.day + 2}`;
    card.setAttribute("draggable", "true");
    card.setAttribute("data-id", sess.id);

    if (clashingSessionIds.has(sess.id)) {
      card.classList.add("clashing");
    }

    const room = db.getById("rooms", sess.roomId);
    const teacher = db.getById("teachers", sess.teacherId);

    let subMetaText = "";
    let iconType = "door-open";
    if (viewType === "section") {
      subMetaText = room ? room.name : "No Room";
      iconType = "door-open";
    } else if (viewType === "teacher") {
      subMetaText = room ? room.name : "No Room";
      iconType = "door-open";
    } else if (viewType === "room") {
      subMetaText = sess.sectionIds.map(sid => db.getById("sections", sid)?.name || "").join(", ");
      iconType = "graduation-cap";
    }

    card.innerHTML = `
      <span class="card-course-code">${sess.courseCode}</span>
      <span class="card-course-name">${sess.courseName}</span>
      <div class="card-meta-row">
        <span class="card-meta-item" title="${teacher ? teacher.name : 'TBA'}"><i data-lucide="user"></i> ${teacher ? teacher.name : "TBA"}</span>
        <span class="card-meta-item" title="${subMetaText}"><i data-lucide="${iconType}"></i> ${subMetaText}</span>
      </div>
      <button class="card-edit-btn"><i data-lucide="edit-2" style="width:12px;height:12px;"></i></button>
    `;

    // Edit button click inside card
    card.querySelector(".card-edit-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      openSessionEditModal(sess);
    });

    // HTML5 Drag Event Listeners
    card.addEventListener("dragstart", (e) => {
      draggedSessionId = sess.id;
      card.style.opacity = "0.4";
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", sess.id);
    });

    card.addEventListener("dragend", () => {
      card.style.opacity = "1";
      draggedSessionId = null;
      document.querySelectorAll(".timetable-slot-cell").forEach(cell => {
        cell.classList.remove("drag-target-valid", "drag-target-invalid");
      });
    });

    grid.appendChild(card);
  });

  lucide.createIcons();
}
function openSessionEditModal(session) {
  document.getElementById("session-form-id").value = session.id;
  document.getElementById("session-form-course").value = session.courseId;
  document.getElementById("session-form-room").value = session.roomId;
  document.getElementById("session-form-day").value = session.day;
  document.getElementById("session-form-slot").value = session.slot;

  document.getElementById("btn-session-delete").style.display = "inline-flex";
  document.getElementById("session-clash-warning").style.display = "none";
  openModal("modal-session");
}


// ================= CONSTRAINT AUDITS SECTION ================= //
function runConflictAudit() {
  const badge = document.getElementById("badge-conflict-count");
  const cleanInd = document.getElementById("audit-indicator-clean");
  const dirtyInd = document.getElementById("audit-indicator-dirty");
  const conflictsCountText = document.getElementById("audit-conflicts-count");

  const hardContainer = document.getElementById("logs-container-hard");
  const softContainer = document.getElementById("logs-container-soft");

  hardContainer.innerHTML = "";
  softContainer.innerHTML = "";

  const activeSchedule = db.getActiveSchedule();
  if (!activeSchedule) {
    cleanInd.style.display = "flex";
    dirtyInd.style.display = "none";
    badge.style.display = "none";

    hardContainer.innerHTML = `<p class="availability-instructions">No active timetable. Create one first.</p>`;
    softContainer.innerHTML = `<p class="availability-instructions">No active timetable. Create one first.</p>`;
    return;
  }

  const audit = Scheduler.checkConflicts(activeSchedule.sessions, db);
  const totalConflicts = audit.conflicts.length;

  if (totalConflicts > 0) {
    badge.textContent = totalConflicts;
    badge.style.display = "inline-block";
    cleanInd.style.display = "none";
    dirtyInd.style.display = "flex";
    conflictsCountText.textContent = totalConflicts;

    // Render hard conflict logs
    audit.conflicts.forEach(c => {
      const log = document.createElement("div");
      log.className = "log-item hard";
      log.innerHTML = `
        <i data-lucide="alert-octagon" class="log-item-icon"></i>
        <span class="log-item-message">${c.message}</span>
        <button class="log-item-action" data-type="fix" data-session-id="${c.sessions ? c.sessions[0].id : ''}">Inspect Card</button>
      `;

      // Hook action button to redirect and select in calendar
      log.querySelector(".log-item-action").addEventListener("click", () => {
        if (c.sessions && c.sessions[0]) {
          const sess = c.sessions[0];
          // Determine search target based on view settings
          const selectType = document.getElementById("select-schedule-view-type");
          selectType.value = "section"; // Default to Section View

          // Find the section's department to prevent filtering it out
          const section = db.getById("sections", sess.sectionIds[0]);
          if (section) {
            const dept = section.department || section.program || "All";
            const selectDept = document.getElementById("select-schedule-dept");
            if (selectDept) {
              selectDept.value = dept;
            }
          }

          selectType.dispatchEvent(new Event("change"));

          // Select matching section in dropdown
          const selectTarget = document.getElementById("select-schedule-view-target");
          selectTarget.value = sess.sectionIds[0];

          switchView("schedule");
          renderScheduleGrid();
        }
      });
      hardContainer.appendChild(log);
    });

  } else {
    badge.style.display = "none";
    cleanInd.style.display = "flex";
    dirtyInd.style.display = "none";
    hardContainer.innerHTML = `<div class="empty-state"><i data-lucide="check-circle-2" class="empty-icon text-success"></i><p>Structural database audit checks out. Zero hard overlaps found.</p></div>`;
  }

  // Render soft warnings
  if (audit.warnings.length > 0) {
    audit.warnings.forEach(w => {
      const log = document.createElement("div");
      log.className = "log-item soft";
      log.innerHTML = `
        <i data-lucide="info" class="log-item-icon"></i>
        <span class="log-item-message">${w.message}</span>
      `;
      softContainer.appendChild(log);
    });
  } else {
    softContainer.innerHTML = `<div class="empty-state"><i data-lucide="sparkles" class="empty-icon text-indigo"></i><p>Nice! This timetable has optimal spacing distribution.</p></div>`;
  }

  lucide.createIcons();
}

document.getElementById("btn-re-audit-schedule").addEventListener("click", () => {
  runConflictAudit();
  alert("Database timetable audit refreshed successfully!");
});


// ================= EXPORTS SECTION ================= //
function exportSchedulePDF() {
  const activeSchedule = db.getActiveSchedule();
  if (!activeSchedule) {
    alert("No active timetable found to export.");
    return;
  }

  const selectType = document.getElementById("select-schedule-view-type");
  const selectTarget = document.getElementById("select-schedule-view-target");
  const viewType = selectType.value;
  const targetId = selectTarget.value;

  if (!targetId) {
    alert("Please select a target to export.");
    return;
  }

  const targetText = selectTarget.options[selectTarget.selectedIndex].text;
  const cleanTargetText = targetText.replace(/[^a-zA-Z0-9]/g, "_");

  const element = document.querySelector(".timetable-board-wrapper");
  if (!element) return;

  // Render a clean title header inside a container for PDF
  const pdfHeader = document.createElement("div");
  pdfHeader.className = "pdf-export-header";
  pdfHeader.style.color = "#ffffff";
  pdfHeader.style.marginBottom = "15px";
  pdfHeader.style.paddingBottom = "10px";
  pdfHeader.style.borderBottom = "2px solid #6366f1";
  pdfHeader.innerHTML = `
    <h1 style="font-size: 20px; font-weight: 800; margin: 0; display: inline-block;">Scheduler<span style="color: #818cf8;">AI</span></h1>
    <span style="font-size: 14px; font-weight: 500; color: #94a3b8; margin-left: 15px; vertical-align: middle;">Timetable Schedule - ${viewType.toUpperCase()}: ${targetText}</span>
  `;
  element.insertBefore(pdfHeader, element.firstChild);

  // Create and append a temporary style tag to force parent containers to expand during capture
  const styleEl = document.createElement("style");
  styleEl.id = "temp-pdf-export-styles";
  styleEl.innerHTML = `
    html.pdf-export-mode .sidebar {
      display: none !important;
    }
    html.pdf-export-mode,
    html.pdf-export-mode body,
    html.pdf-export-mode .app-container,
    html.pdf-export-mode .main-content,
    html.pdf-export-mode .view-panel,
    html.pdf-export-mode .view-panel.active,
    html.pdf-export-mode .timetable-board-wrapper {
      margin-left: 0 !important;
      padding-left: 0 !important;
      overflow: visible !important;
      overflow-x: visible !important;
      max-width: none !important;
      width: max-content !important;
      min-width: max-content !important;
    }
    html.pdf-export-mode .timetable-grid {
      min-width: 1600px !important;
      width: max-content !important;
      max-width: none !important;
      overflow: visible !important;
    }
    html.pdf-export-mode .card-edit-btn,
    html.pdf-export-mode .badge-action-trigger {
      display: none !important;
    }
  `;
  document.head.appendChild(styleEl);
  document.documentElement.classList.add("pdf-export-mode");

  // Show status to user
  const btn = document.getElementById("btn-export-pdf");
  const activeBtn = document.getElementById("btn-export-active-pdf");
  const origBtnHTML = btn ? btn.innerHTML : "";
  const origActiveHTML = activeBtn ? activeBtn.innerHTML : "";

  if (btn) { btn.innerHTML = `<i class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></i> Generating PDF...`; btn.disabled = true; }
  if (activeBtn) { activeBtn.innerHTML = `<i class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></i> Generating PDF...`; activeBtn.disabled = true; }

  // Set timeout to let DOM render styles before capturing
  setTimeout(() => {
    try {
      // Trace dimensions as requested
      console.log("PDF Export Debug Dimensions:", {
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        offsetWidth: element.offsetWidth,
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight
      });

      // Set options for html2pdf with the full scroll dimensions
      const opt = {
        margin:       0.2,
        filename:     `timetable_${viewType}_${cleanTargetText}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { 
          scale: 2, 
          useCORS: true, 
          backgroundColor: '#090a0f',
          logging: false,
          width: element.scrollWidth,
          height: element.scrollHeight,
          windowWidth: element.scrollWidth,
          windowHeight: element.scrollHeight,
          scrollX: 0,
          scrollY: 0
        },
        jsPDF:        { unit: 'in', format: 'letter', orientation: 'landscape' }
      };

      // Generate PDF using html2pdf library directly
      html2pdf().set(opt).from(element).save().then(() => {
        // Cleanup temporary styles and classes
        document.documentElement.classList.remove("pdf-export-mode");
        const tempStyle = document.getElementById("temp-pdf-export-styles");
        if (tempStyle) tempStyle.remove();
        element.removeChild(pdfHeader);
        
        if (btn) { btn.innerHTML = origBtnHTML; btn.disabled = false; }
        if (activeBtn) { activeBtn.innerHTML = origActiveHTML; activeBtn.disabled = false; }
        lucide.createIcons();
      }).catch(err => {
        throw err;
      });

    } catch (err) {
      console.error("PDF generation error:", err);
      alert("Direct PDF export failed. Please use 'Print / PDF' button instead.");
      
      // Cleanup on error
      document.documentElement.classList.remove("pdf-export-mode");
      const tempStyle = document.getElementById("temp-pdf-export-styles");
      if (tempStyle) tempStyle.remove();
      if (element.contains(pdfHeader)) element.removeChild(pdfHeader);
      
      if (btn) { btn.innerHTML = origBtnHTML; btn.disabled = false; }
      if (activeBtn) { activeBtn.innerHTML = origActiveHTML; activeBtn.disabled = false; }
      lucide.createIcons();
    }
  }, 100);
}

function exportScheduleListPDF() {
  const activeSchedule = db.getActiveSchedule();
  if (!activeSchedule) {
    alert("No active timetable found to export.");
    return;
  }

  const selectType = document.getElementById("select-schedule-view-type");
  const selectTarget = document.getElementById("select-schedule-view-target");
  const viewType = selectType.value;
  const targetId = selectTarget.value;

  if (!targetId) {
    alert("Please select a target to export.");
    return;
  }

  const targetText = selectTarget.options[selectTarget.selectedIndex].text;
  const cleanTargetText = targetText.replace(/[^a-zA-Z0-9]/g, "_");

  // Filter sessions that belong to the active visual target
  const filteredSessions = activeSchedule.sessions.filter(sess => {
    if (viewType === "section") {
      return sess.sectionIds && sess.sectionIds.includes(targetId);
    } else if (viewType === "teacher") {
      return sess.teacherId === targetId;
    } else if (viewType === "room") {
      return sess.roomId === targetId;
    }
    return false;
  });

  // Sort sessions chronologically
  const sortedSessions = [...filteredSessions].sort((a, b) => {
    if (a.day !== b.day) return a.day - b.day;
    return a.slot - b.slot;
  });

  const listContainer = document.createElement("div");
  listContainer.style.position = "absolute";
  listContainer.style.left = "-9999px";
  listContainer.style.top = "-9999px";
  listContainer.style.width = "800px";
  listContainer.style.background = "#090a0f";
  listContainer.style.color = "#ffffff";
  listContainer.style.fontFamily = "'Outfit', sans-serif";
  listContainer.style.padding = "30px";
  listContainer.style.borderRadius = "8px";

  let header5 = "Instructor";
  let header6 = "Room";
  if (viewType === "teacher") {
    header5 = "Room";
    header6 = "Batches";
  } else if (viewType === "room") {
    header5 = "Instructor";
    header6 = "Batches";
  }

  let tableRowsHTML = "";
  if (sortedSessions.length === 0) {
    tableRowsHTML = `<tr><td colspan="6" style="text-align: center; padding: 20px; color: #94a3b8;">No sessions scheduled.</td></tr>`;
  } else {
    sortedSessions.forEach(s => {
      const dayStr = db.timeSettings.days[s.day];
      const timeStr = db.timeSettings.slotTimes[s.slot];
      const teacher = db.getById("teachers", s.teacherId)?.name || "Unassigned";
      const room = db.getById("rooms", s.roomId)?.name || "Unassigned";
      const sectionsStr = s.sectionIds.map(sid => db.getById("sections", sid)?.name || "").join(", ");

      let val5 = teacher;
      let val6 = room;
      if (viewType === "teacher") {
        val5 = room;
        val6 = sectionsStr;
      } else if (viewType === "room") {
        val5 = teacher;
        val6 = sectionsStr;
      }

      tableRowsHTML += `
        <tr style="border-bottom: 1px solid #1e293b;">
          <td style="padding: 12px 10px; font-weight: 600; color: #818cf8;">${dayStr}</td>
          <td style="padding: 12px 10px; color: #e2e8f0;">${timeStr}</td>
          <td style="padding: 12px 10px; font-weight: 600; color: #ffffff;">${s.courseCode}</td>
          <td style="padding: 12px 10px; color: #cbd5e1;">${s.courseName}</td>
          <td style="padding: 12px 10px; color: #e2e8f0;">${val5}</td>
          <td style="padding: 12px 10px; color: #94a3b8;">${val6}</td>
        </tr>
      `;
    });
  }

  listContainer.innerHTML = `
    <div style="border-bottom: 2px solid #6366f1; padding-bottom: 15px; margin-bottom: 20px;">
      <h1 style="font-size: 24px; font-weight: 800; margin: 0; display: inline-block; color: #ffffff;">Scheduler<span style="color: #818cf8;">AI</span></h1>
      <span style="font-size: 16px; font-weight: 500; color: #94a3b8; margin-left: 15px; vertical-align: middle;">Class Schedule List</span>
      <div style="margin-top: 8px; font-size: 14px; color: #cbd5e1;">
        <strong>Filter Type:</strong> ${viewType.toUpperCase()} | <strong>Target:</strong> ${targetText}
      </div>
    </div>
    <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 13px;">
      <thead>
        <tr style="border-bottom: 2px solid #334155; color: #94a3b8; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em;">
          <th style="padding: 10px;">Day</th>
          <th style="padding: 10px;">Time Slot</th>
          <th style="padding: 10px;">Code</th>
          <th style="padding: 10px;">Course Title</th>
          <th style="padding: 10px;">${header5}</th>
          <th style="padding: 10px;">${header6}</th>
        </tr>
      </thead>
      <tbody>
        ${tableRowsHTML}
      </tbody>
    </table>
    <div style="margin-top: 30px; border-top: 1px solid #1e293b; padding-top: 10px; text-align: center; font-size: 11px; color: #64748b;">
      Generated by SchedulerAI on ${new Date().toLocaleString()}
    </div>
  `;

  document.body.appendChild(listContainer);

  const opt = {
    margin: 0.4,
    filename: `schedule_list_${viewType}_${cleanTargetText}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: {
      scale: 2,
      useCORS: true,
      backgroundColor: '#090a0f',
      logging: false
    },
    jsPDF: { unit: 'in', format: 'letter', orientation: 'landscape' }
  };

  const btn = document.getElementById("btn-export-csv");
  const origBtnHTML = btn ? btn.innerHTML : "";
  if (btn) { btn.innerHTML = `<i data-lucide="loader"></i> Generating PDF...`; btn.disabled = true; }

  html2pdf().set(opt).from(listContainer).save().then(() => {
    document.body.removeChild(listContainer);
    if (btn) { btn.innerHTML = origBtnHTML; btn.disabled = false; }
    lucide.createIcons();
  }).catch(err => {
    console.error("PDF list export failed:", err);
    alert("PDF list export failed.");
    document.body.removeChild(listContainer);
    if (btn) { btn.innerHTML = origBtnHTML; btn.disabled = false; }
    lucide.createIcons();
  });
}

function exportScheduleCSV() {
  const activeSchedule = db.getActiveSchedule();
  if (!activeSchedule) {
    alert("No active timetable found to export.");
    return;
  }

  // Header
  let csvContent = "Day,Period,Time,Course Code,Course Title,Instructor,Room,Batches\r\n";

  // Sort sessions chronologically
  const sortedSessions = [...activeSchedule.sessions].sort((a, b) => {
    if (a.day !== b.day) return a.day - b.day;
    return a.slot - b.slot;
  });

  sortedSessions.forEach(s => {
    const dayStr = db.timeSettings.days[s.day];
    const timeStr = db.timeSettings.slotTimes[s.slot];
    const teacher = db.getById("teachers", s.teacherId)?.name || "Unassigned";
    const room = db.getById("rooms", s.roomId)?.name || "Unassigned";

    // Resolve section names
    const sectionsStr = s.sectionIds.map(sid => db.getById("sections", sid)?.name || "").join("; ");

    // Clean text fields for CSV safe
    const cleanCourseName = s.courseName.replace(/"/g, '""');
    const cleanTeacherName = teacher.replace(/"/g, '""');

    csvContent += `"${dayStr}","Period ${s.slot + 1}","${timeStr}","${s.courseCode}","${cleanCourseName}","${cleanTeacherName}","${room}","${sectionsStr}"\r\n`;
  });

  const dateStr = new Date().toLocaleDateString().replace(/\//g, "-");
  downloadCSVFile(csvContent, `timetable_schedule_${dateStr}.csv`);
}

function exportScheduleTabularCSV() {
  const activeSchedule = db.getActiveSchedule();
  if (!activeSchedule) {
    alert("No active timetable found to export.");
    return;
  }

  const selectType = document.getElementById("select-schedule-view-type");
  const selectTarget = document.getElementById("select-schedule-view-target");
  const viewType = selectType.value;
  const targetId = selectTarget.value;

  if (!targetId) {
    alert("Please select a target to export.");
    return;
  }

  const targetText = selectTarget.options[selectTarget.selectedIndex].text;

  // Filter sessions for the target
  const filteredSessions = activeSchedule.sessions.filter(sess => {
    if (viewType === "section") {
      return sess.sectionIds && sess.sectionIds.includes(targetId);
    } else if (viewType === "teacher") {
      return sess.teacherId === targetId;
    } else if (viewType === "room") {
      return sess.roomId === targetId;
    }
    return false;
  });

  const daysCount = db.timeSettings.days.length;
  const slotsCount = db.timeSettings.slotsPerDay;

  // Build grid matrix: daysCount rows, slotsCount columns
  const matrix = Array.from({ length: daysCount }, () => Array(slotsCount).fill(""));

  // Fill in active sessions
  filteredSessions.forEach(sess => {
    if (sess.day === undefined || sess.slot === undefined) return;
    if (sess.slot === 10) return; // Skip lunch break

    const course = db.getById("courses", sess.courseId);
    const roomType = sess.roomType || (course ? course.roomType : "lecture");
    const spanVal = roomType === "lab" ? (sess.slot === 0 ? 6 : (sess.slot === 11 ? 4 : 6)) : 3;

    const room = db.getById("rooms", sess.roomId)?.name || "No Room";
    const teacher = db.getById("teachers", sess.teacherId)?.name || "Unassigned";
    const sectionsStr = sess.sectionIds.map(sid => db.getById("sections", sid)?.name || "").join("; ");

    // Construct cell text
    let cellText = `${sess.courseCode} (${sess.courseName})`;
    if (viewType === "section") {
      cellText += ` [Rm: ${room}] [Tchr: ${teacher}]`;
    } else if (viewType === "teacher") {
      cellText += ` [Rm: ${room}] [Sec: ${sectionsStr}]`;
    } else if (viewType === "room") {
      cellText += ` [Tchr: ${teacher}] [Sec: ${sectionsStr}]`;
    }

    // Fill all slots spanned by this session
    for (let offset = 0; offset < spanVal; offset++) {
      const currentSlot = sess.slot + offset;
      if (currentSlot < slotsCount) {
        if (offset === 0) {
          matrix[sess.day][currentSlot] = cellText;
        } else {
          matrix[sess.day][currentSlot] = `${sess.courseCode} (Cont.)`;
        }
      }
    }
  });

  // Inject Lunch break text into S-11 (index 10) for all days
  for (let d = 0; d < daysCount; d++) {
    matrix[d][10] = "LUNCH & PRAYER BREAK";
  }

  // Construct CSV String
  let csvContent = "";

  // Header row: "Day", slotTimes...
  const headers = ["Day", ...db.timeSettings.slotTimes];
  csvContent += headers.map(h => `"${h.replace(/"/g, '""')}"`).join(",") + "\r\n";

  // Rows
  for (let d = 0; d < daysCount; d++) {
    const dayName = db.timeSettings.days[d];
    const rowValues = [dayName, ...matrix[d]];
    csvContent += rowValues.map(v => `"${v.replace(/"/g, '""')}"`).join(",") + "\r\n";
  }

  // Use Blob download helper
  const cleanTargetText = targetText.replace(/[^a-zA-Z0-9]/g, "_");
  downloadCSVFile(csvContent, `tabular_timetable_${viewType}_${cleanTargetText}.csv`);
}

function downloadCSVFile(csvContent, fileName) {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", fileName);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

function downloadDatabaseBackup() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(localStorage.getItem(db.key));
  const downloadAnchor = document.createElement("a");
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `timetable_backup_${new Date().toLocaleDateString().replace(/\//g, "-")}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  document.body.removeChild(downloadAnchor);
}


// ================= FILE IMPORTER WIZARD (OCR & PARSING) ================= //
function initImporter() {
  const dropZone = document.getElementById("file-drop-zone");
  const fileInput = document.getElementById("importer-file-input");

  // Prevent default behaviors for Drag & Drop
  ["dragenter", "dragover", "dragleave", "drop"].forEach(eventName => {
    dropZone.addEventListener(eventName, preventDefaults, false);
  });

  function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  // Visual drag indicators
  ["dragenter", "dragover"].forEach(eventName => {
    dropZone.addEventListener(eventName, () => dropZone.classList.add("dragover"), false);
  });

  ["dragleave", "drop"].forEach(eventName => {
    dropZone.addEventListener(eventName, () => dropZone.classList.remove("dragover"), false);
  });

  // Handle dropped files
  dropZone.addEventListener("drop", (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length > 0) {
      handleUploadedFile(files[0]);
    }
  });

  // Handle browse upload
  fileInput.addEventListener("change", () => {
    if (fileInput.files.length > 0) {
      handleUploadedFile(fileInput.files[0]);
    }
  });

  // Wizard Back Button
  document.getElementById("btn-importer-back").addEventListener("click", () => {
    document.getElementById("importer-upload-step").style.display = "block";
    document.getElementById("importer-mapping-step").style.display = "none";
  });

  // Apply CSV Mapping Button
  document.getElementById("btn-apply-csv-mapping").addEventListener("click", applyCsvColumnMappings);

  // Wizard Add blank row
  document.getElementById("btn-wizard-add-row").addEventListener("click", () => {
    detectedSessionsList.push({
      id: "manual_row_" + Math.random().toString(36).substr(2, 9),
      rawText: "Manual entry",
      courseId: "",
      courseCode: "",
      teacherId: "",
      roomId: "",
      sectionIds: [],
      day: 0,
      slot: 0
    });
    renderWizardTable();
  });

  // Wizard Save All Import Button
  document.getElementById("btn-importer-save-all").addEventListener("click", completeWizardImport);
}

// Global dynamic library loader status
let librariesInitialized = false;

async function handleUploadedFile(file) {
  const loader = document.getElementById("importer-loader");
  const loaderTitle = document.getElementById("importer-loader-title");
  const loaderSub = document.getElementById("importer-loader-subtitle");
  const progressContainer = document.getElementById("ocr-progress-container");
  const progressFill = document.getElementById("ocr-progress-fill");

  loader.style.display = "flex";
  progressContainer.style.display = "none";

  const ext = file.name.split(".").pop().toLowerCase();

  try {
    if (ext === "csv") {
      loaderTitle.textContent = "Parsing CSV File...";
      loaderSub.textContent = "Structuring rows and columns";

      const reader = new FileReader();
      reader.onload = function (e) {
        const text = e.target.result;
        parsedRawText = text;
        parsedCsvRows = Parser.parseCSV(text);

        loader.style.display = "none";
        setupCsvColumnMappingsWizard();
      };
      reader.readAsText(file);

    } else {
      // PDF or Images need external CDN libraries
      if (!librariesInitialized) {
        loaderTitle.textContent = "Loading OCR Engines...";
        loaderSub.textContent = "Fetching PDF.js and Tesseract.js libraries via CDN...";
        await Parser.initializeParsers();
        librariesInitialized = true;
      }

      if (ext === "pdf") {
        loaderTitle.textContent = "Extracting PDF Text...";
        loaderSub.textContent = "Reading document pages...";
        progressContainer.style.display = "block";

        const extractedText = await Parser.extractTextFromPDF(file, (progressVal, msg) => {
          progressFill.style.width = `${Math.round(progressVal * 100)}%`;
          loaderSub.textContent = msg;
        });

        parsedRawText = extractedText;
        processHeuristicTextImport(extractedText);

      } else if (["png", "jpg", "jpeg"].includes(ext)) {
        loaderTitle.textContent = "Running Image OCR...";
        loaderSub.textContent = "Analyzing timetable layout and text blocks...";
        progressContainer.style.display = "block";

        const ocrText = await Parser.extractTextFromImage(file, (progressVal, msg) => {
          progressFill.style.width = `${Math.round(progressVal * 100)}%`;
          loaderSub.textContent = msg;
        });

        parsedRawText = ocrText;
        processHeuristicTextImport(ocrText);
      } else {
        alert("Unsupported file format. Please upload CSV, PDF, PNG, or JPEG.");
        loader.style.display = "none";
      }
    }
  } catch (err) {
    alert("Error processing file: " + err.message);
    loader.style.display = "none";
    console.error(err);
  }
}

// Setup CSV Mapping Step
function setupCsvColumnMappingsWizard() {
  document.getElementById("importer-upload-step").style.display = "none";
  document.getElementById("importer-mapping-step").style.display = "block";
  document.getElementById("csv-column-mappings").style.display = "block";

  // Show raw preview
  document.getElementById("extracted-raw-text-preview").value = parsedRawText;

  if (parsedCsvRows.length === 0) return;

  const headerRow = parsedCsvRows[0];
  const selectElements = document.querySelectorAll(".select-column-index");

  selectElements.forEach(select => {
    select.innerHTML = `<option value="">-- Choose Column --</option>`;
    headerRow.forEach((colName, index) => {
      select.innerHTML += `<option value="${index}">Col ${index + 1}: ${colName.substring(0, 20)}</option>`;
    });
  });

  // Try to auto-detect columns based on header keywords
  headerRow.forEach((colName, index) => {
    const val = colName.toLowerCase();
    if (val.includes("course") || val.includes("code") || val.includes("subject")) {
      document.getElementById("csv-map-course").value = index;
    } else if (val.includes("teacher") || val.includes("instructor") || val.includes("prof")) {
      document.getElementById("csv-map-teacher").value = index;
    } else if (val.includes("room") || val.includes("class")) {
      document.getElementById("csv-map-room").value = index;
    } else if (val.includes("section") || val.includes("batch") || val.includes("group")) {
      document.getElementById("csv-map-section").value = index;
    } else if (val.includes("day")) {
      document.getElementById("csv-map-day").value = index;
    } else if (val.includes("time") || val.includes("slot") || val.includes("period")) {
      document.getElementById("csv-map-slot").value = index;
    }
  });

  // Initialize with empty array
  detectedSessionsList = [];
  renderWizardTable();
}

// Convert CSV rows to sessions based on column map
function applyCsvColumnMappings() {
  const colMap = {
    course: document.getElementById("csv-map-course").value,
    teacher: document.getElementById("csv-map-teacher").value,
    room: document.getElementById("csv-map-room").value,
    section: document.getElementById("csv-map-section").value,
    day: document.getElementById("csv-map-day").value,
    slot: document.getElementById("csv-map-slot").value
  };

  if (!colMap.course && !colMap.section) {
    alert("Please map at least Course Code or Student Section column.");
    return;
  }

  detectedSessionsList = [];

  // Skip header row
  for (let i = 1; i < parsedCsvRows.length; i++) {
    const row = parsedCsvRows[i];

    // Resolve Day Index
    let dayIndex = 0;
    if (colMap.day && row[colMap.day]) {
      const dayVal = row[colMap.day].toLowerCase();
      db.timeSettings.days.forEach((day, index) => {
        if (day.toLowerCase().includes(dayVal) || dayVal.includes(day.toLowerCase())) {
          dayIndex = index;
        }
      });
    }

    // Resolve Slot Index
    let slotIndex = 0;
    if (colMap.slot && row[colMap.slot]) {
      const slotVal = row[colMap.slot].toLowerCase();
      // Try index matching first (e.g. Period 2)
      const matches = /\b([1-5])\b/.exec(slotVal);
      if (matches) {
        slotIndex = parseInt(matches[1]) - 1;
      } else {
        // Try duration overlap match
        db.timeSettings.slotTimes.forEach((time, index) => {
          if (time.toLowerCase().includes(slotVal) || slotVal.includes(time.toLowerCase())) {
            slotIndex = index;
          }
        });
      }
    }

    // Heuristics lookup in existing DB matching strings
    const courseCodeStr = colMap.course && row[colMap.course] ? row[colMap.course].toUpperCase() : "";
    const teacherStr = colMap.teacher && row[colMap.teacher] ? row[colMap.teacher] : "";
    const roomStr = colMap.room && row[colMap.room] ? row[colMap.room] : "";
    const sectionStr = colMap.section && row[colMap.section] ? row[colMap.section] : "";

    // Find course ID
    const foundCourse = db.getAll("courses").find(c => c.code.replace(/[- ]/g, "").toUpperCase() === courseCodeStr.replace(/[- ]/g, "").toUpperCase());

    // Find teacher ID
    const foundTeacher = db.getAll("teachers").find(t => t.name.toLowerCase().includes(teacherStr.toLowerCase()));

    // Find room ID
    const foundRoom = db.getAll("rooms").find(r => r.name.toLowerCase() === roomStr.toLowerCase());

    // Find section ID
    const foundSection = db.getAll("sections").find(s => s.name.toLowerCase() === sectionStr.toLowerCase());

    detectedSessionsList.push({
      id: "parsed_csv_" + i + "_" + Math.random().toString(36).substr(2, 5),
      rawText: row.join(", "),
      courseId: foundCourse ? foundCourse.id : "",
      courseCode: courseCodeStr,
      teacherId: foundTeacher ? foundTeacher.id : "",
      teacherName: teacherStr,
      roomId: foundRoom ? foundRoom.id : "",
      roomName: roomStr,
      sectionIds: foundSection ? [foundSection.id] : [],
      sectionName: sectionStr,
      day: dayIndex,
      slot: slotIndex
    });
  }

  renderWizardTable();
}

// Process PDF or OCR Heuristic matches
function processHeuristicTextImport(text) {
  document.getElementById("importer-upload-step").style.display = "none";
  document.getElementById("importer-mapping-step").style.display = "block";
  document.getElementById("csv-column-mappings").style.display = "none";
  document.getElementById("extracted-raw-text-preview").value = text;
  document.getElementById("importer-loader").style.display = "none";

  detectedSessionsList = Parser.heuristicParseText(text, db);
  renderWizardTable();
}

// Render wizard table rows with selectors
function renderWizardTable() {
  const tbody = document.getElementById("importer-wizard-tbody");
  tbody.innerHTML = "";

  document.getElementById("detected-sessions-count").textContent = detectedSessionsList.length;

  if (detectedSessionsList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="availability-instructions" style="text-align:center;">No parsed session rows available. Click "Add Blank Row" or configure mappings.</td></tr>`;
    return;
  }

  detectedSessionsList.forEach((sess, idx) => {
    const row = document.createElement("tr");

    // Course code cell dropdown/input
    let courseSelectHtml = `<select class="form-control-xs select-wiz-course" data-idx="${idx}"><option value="">-- Unassigned --</option>`;
    db.getAll("courses").forEach(c => {
      courseSelectHtml += `<option value="${c.id}" ${c.id === sess.courseId ? 'selected' : ''}>${c.code}</option>`;
    });
    courseSelectHtml += `<option value="NEW_ITEM">Create "${sess.courseCode || 'New'}"</option></select>`;

    // Teacher cell dropdown/input
    let teacherSelectHtml = `<select class="form-control-xs select-wiz-teacher" data-idx="${idx}"><option value="">-- Unassigned --</option>`;
    db.getAll("teachers").forEach(t => {
      teacherSelectHtml += `<option value="${t.id}" ${t.id === sess.teacherId ? 'selected' : ''}>${t.name}</option>`;
    });
    teacherSelectHtml += `<option value="NEW_ITEM">Create "${sess.teacherName || 'New'}"</option></select>`;

    // Room cell dropdown/input
    let roomSelectHtml = `<select class="form-control-xs select-wiz-room" data-idx="${idx}"><option value="">-- Unassigned --</option>`;
    db.getAll("rooms").forEach(r => {
      roomSelectHtml += `<option value="${r.id}" ${r.id === sess.roomId ? 'selected' : ''}>${r.name}</option>`;
    });
    roomSelectHtml += `<option value="NEW_ITEM">Create "${sess.roomName || 'New'}"</option></select>`;

    // Section cell select (multi select or single drop)
    let sectionSelectHtml = `<select class="form-control-xs select-wiz-section" data-idx="${idx}"><option value="">-- Unassigned --</option>`;
    db.getAll("sections").forEach(s => {
      const isSelected = sess.sectionIds.includes(s.id);
      sectionSelectHtml += `<option value="${s.id}" ${isSelected ? 'selected' : ''}>${s.name}</option>`;
    });
    sectionSelectHtml += `<option value="NEW_ITEM">Create "${sess.sectionName || 'New'}"</option></select>`;

    // Day select
    let daySelectHtml = `<select class="form-control-xs select-wiz-day" data-idx="${idx}">`;
    db.timeSettings.days.forEach((day, index) => {
      daySelectHtml += `<option value="${index}" ${index === sess.day ? 'selected' : ''}>${day}</option>`;
    });
    daySelectHtml += `</select>`;

    // Period select
    let slotSelectHtml = `<select class="form-control-xs select-wiz-slot" data-idx="${idx}">`;
    db.timeSettings.slotTimes.forEach((time, index) => {
      slotSelectHtml += `<option value="${index}" ${index === sess.slot ? 'selected' : ''}>Period ${index + 1} (${time})</option>`;
    });
    slotSelectHtml += `</select>`;

    row.innerHTML = `
      <td class="td-raw-text" title="${sess.rawText}">${sess.rawText}</td>
      <td>${courseSelectHtml}</td>
      <td>${teacherSelectHtml}</td>
      <td>${roomSelectHtml}</td>
      <td>${sectionSelectHtml}</td>
      <td>${daySelectHtml}</td>
      <td>${slotSelectHtml}</td>
      <td style="text-align:center;">
        <button class="btn-icon text-danger btn-wiz-row-delete" data-idx="${idx}"><i data-lucide="trash-2"></i></button>
      </td>
    `;

    // Row edit change bindings
    row.querySelector(".select-wiz-course").addEventListener("change", (e) => {
      const idx = e.target.getAttribute("data-idx");
      const val = e.target.value;
      if (val === "NEW_ITEM") {
        const newCode = prompt("Enter new Course Code:", sess.courseCode || "CS-");
        if (newCode) {
          const newName = prompt("Enter Course Name:", "Imported Course");
          const c = db.add("courses", { code: newCode, name: newName || "Imported Course", sessionsPerWeek: 2, roomType: "lecture", teacherId: "", sectionIds: [] });
          detectedSessionsList[idx].courseId = c.id;
          detectedSessionsList[idx].courseCode = c.code;
          initFormSelects();
          renderWizardTable();
        } else {
          e.target.value = "";
        }
      } else {
        detectedSessionsList[idx].courseId = val;
        detectedSessionsList[idx].courseCode = db.getById("courses", val)?.code || "";
      }
    });

    row.querySelector(".select-wiz-teacher").addEventListener("change", (e) => {
      const idx = e.target.getAttribute("data-idx");
      const val = e.target.value;
      if (val === "NEW_ITEM") {
        const newName = prompt("Enter new Instructor Name:", sess.teacherName || "Dr. ");
        if (newName) {
          const t = db.add("teachers", { name: newName, email: newName.toLowerCase().replace(/[^a-z]/g, "") + "@university.edu", maxHours: 12, availability: Array.from({ length: db.timeSettings.days.length }, () => new Array(db.timeSettings.slotsPerDay).fill(true)) });
          detectedSessionsList[idx].teacherId = t.id;
          initFormSelects();
          renderWizardTable();
        } else {
          e.target.value = "";
        }
      } else {
        detectedSessionsList[idx].teacherId = val;
      }
    });

    row.querySelector(".select-wiz-room").addEventListener("change", (e) => {
      const idx = e.target.getAttribute("data-idx");
      const val = e.target.value;
      if (val === "NEW_ITEM") {
        const newRoom = prompt("Enter new Room Name:", sess.roomName || "Room ");
        if (newRoom) {
          const r = db.add("rooms", { name: newRoom, type: "lecture", capacity: 40, availability: Array.from({ length: db.timeSettings.days.length }, () => new Array(db.timeSettings.slotsPerDay).fill(true)) });
          detectedSessionsList[idx].roomId = r.id;
          initFormSelects();
          renderWizardTable();
        } else {
          e.target.value = "";
        }
      } else {
        detectedSessionsList[idx].roomId = val;
      }
    });

    row.querySelector(".select-wiz-section").addEventListener("change", (e) => {
      const idx = e.target.getAttribute("data-idx");
      const val = e.target.value;
      if (val === "NEW_ITEM") {
        const newSection = prompt("Enter new Section/Batch Name:", sess.sectionName || "");
        if (newSection) {
          const s = db.add("sections", { name: newSection, size: 30, program: "Imported Department", semester: 1 });
          detectedSessionsList[idx].sectionIds = [s.id];
          initFormSelects();
          renderWizardTable();
        } else {
          e.target.value = "";
        }
      } else {
        detectedSessionsList[idx].sectionIds = val ? [val] : [];
      }
    });

    row.querySelector(".select-wiz-day").addEventListener("change", (e) => {
      const idx = e.target.getAttribute("data-idx");
      detectedSessionsList[idx].day = parseInt(e.target.value);
    });

    row.querySelector(".select-wiz-slot").addEventListener("change", (e) => {
      const idx = e.target.getAttribute("data-idx");
      detectedSessionsList[idx].slot = parseInt(e.target.value);
    });

    // Row deletion from wizard
    row.querySelector(".btn-wiz-row-delete").addEventListener("click", (e) => {
      const idx = parseInt(e.target.closest("button").getAttribute("data-idx"));
      detectedSessionsList.splice(idx, 1);
      renderWizardTable();
    });

    tbody.appendChild(row);
  });

  lucide.createIcons();
}

// Complete wizard import and save new schedule
function completeWizardImport() {
  // Validate rows
  const cleanSessions = [];

  for (let i = 0; i < detectedSessionsList.length; i++) {
    const s = detectedSessionsList[i];
    if (!s.courseId) {
      alert(`Row ${i + 1} has no assigned Course Code! All imported entries must map to a course.`);
      return;
    }
    if (!s.roomId) {
      alert(`Row ${i + 1} (${s.courseCode}) has no assigned Classroom/Room!`);
      return;
    }
    if (!s.sectionIds || s.sectionIds.length === 0) {
      alert(`Row ${i + 1} (${s.courseCode}) has no assigned Student Batch!`);
      return;
    }

    cleanSessions.push({
      id: "sess_import_" + Math.random().toString(36).substr(2, 9),
      courseId: s.courseId,
      courseCode: db.getById("courses", s.courseId).code,
      courseName: db.getById("courses", s.courseId).name,
      teacherId: s.teacherId,
      sectionIds: s.sectionIds,
      roomId: s.roomId,
      day: s.day,
      slot: s.slot
    });
  }

  // Create new timetable schedule
  const importedSchedule = db.addSchedule({
    name: "Imported Timetable (" + new Date().toLocaleDateString() + ")",
    sessions: cleanSessions,
    fitness: 0 // Calculate fitness on audit
  });

  alert(`Import Completed! Successfully saved ${cleanSessions.length} timetable entries.`);

  // Reset steps and switch view
  document.getElementById("importer-upload-step").style.display = "block";
  document.getElementById("importer-mapping-step").style.display = "none";

  switchView("schedule");
  updateDashboardStats();
  runConflictAudit();
}

// ================= AI COPILOT CHAT SIDEBAR BINDINGS ================= //
function initCopilotChat() {
  const panel = document.getElementById("copilot-panel");
  const toggleBtn = document.getElementById("btn-copilot-toggle");
  const closeBtn = document.getElementById("btn-copilot-close");
  const sendBtn = document.getElementById("btn-copilot-send");
  const inputField = document.getElementById("copilot-input-text");

  const settingsBtn = document.getElementById("btn-copilot-settings");
  const settingsDrawer = document.getElementById("copilot-settings-drawer");
  const providerSelect = document.getElementById("copilot-provider");
  const apiKeyGroup = document.getElementById("api-key-form-group");
  const modelGroup = document.getElementById("model-form-group");
  const saveSettingsBtn = document.getElementById("btn-save-copilot-settings");

  // Toggle panel
  toggleBtn.addEventListener("click", () => {
    panel.classList.toggle("active");
  });

  closeBtn.addEventListener("click", () => {
    panel.classList.remove("active");
  });

  // Toggle settings drawer
  settingsBtn.addEventListener("click", () => {
    settingsDrawer.style.display = settingsDrawer.style.display === "none" ? "block" : "none";
  });

  // Sync provider change
  providerSelect.addEventListener("change", () => {
    const val = providerSelect.value;
    const modelSelect = document.getElementById("copilot-model");
    modelSelect.innerHTML = ""; // Clear existing options

    if (val === "local") {
      apiKeyGroup.style.display = "none";
      if (modelGroup) modelGroup.style.display = "none";
    } else {
      apiKeyGroup.style.display = "block";
      if (modelGroup) modelGroup.style.display = "block";

      // Populate models based on provider
      if (val === "gemini") {
        const geminiModels = [
          { value: "gemini-2.0-flash", text: "Gemini 2.0 Flash (Fastest)" },
          { value: "gemini-2.5-flash", text: "Gemini 2.5 Flash" },
          { value: "gemini-2.5-pro", text: "Gemini 2.5 Pro (Deep reasoning)" },
          { value: "gemini-flash-latest", text: "Gemini Flash Latest" }
        ];
        geminiModels.forEach(m => {
          const opt = document.createElement("option");
          opt.value = m.value;
          opt.textContent = m.text;
          modelSelect.appendChild(opt);
        });
      } else if (val === "openai") {
        const openaiModels = [
          { value: "gpt-4o-mini", text: "GPT-4o Mini" },
          { value: "gpt-4o", text: "GPT-4o" }
        ];
        openaiModels.forEach(m => {
          const opt = document.createElement("option");
          opt.value = m.value;
          opt.textContent = m.text;
          modelSelect.appendChild(opt);
        });
      } else if (val === "openrouter") {
        const openrouterModels = [
          { value: "google/gemini-2.5-flash", text: "Gemini 2.5 Flash" },
          { value: "google/gemini-2.5-pro", text: "Gemini 2.5 Pro" },
          { value: "openai/gpt-4o-mini", text: "GPT-4o Mini" },
          { value: "meta-llama/llama-3.3-70b-instruct:free", text: "Llama 3.3 70B (Free)" }
        ];
        openrouterModels.forEach(m => {
          const opt = document.createElement("option");
          opt.value = m.value;
          opt.textContent = m.text;
          modelSelect.appendChild(opt);
        });
      }

      // Fill values
      document.getElementById("copilot-api-key").value = copilot.config.apiKey;

      // Select the current model if valid, otherwise fallback to first option
      if (copilot.config.model) {
        modelSelect.value = copilot.config.model;
      }
      if (!modelSelect.value && modelSelect.options.length > 0) {
        modelSelect.selectedIndex = 0;
      }
    }
  });

  // Save settings
  saveSettingsBtn.addEventListener("click", () => {
    const provider = providerSelect.value;
    const apiKey = document.getElementById("copilot-api-key").value.trim();
    const model = document.getElementById("copilot-model").value.trim();

    copilot.saveConfig(provider, apiKey, model);
    settingsDrawer.style.display = "none";

    updateHeaderStatusBadge();

    addSystemChatMessage(`Configuration updated. Switched to ${provider.toUpperCase()} mode.`, "success");
  });

  // Trigger initial change
  providerSelect.value = copilot.config.provider;
  providerSelect.dispatchEvent(new Event("change"));

  // Connection / Status Badge in Header
  updateHeaderStatusBadge();

  // Suggestions chips
  const suggestionChips = document.querySelectorAll(".suggestion-chip");
  suggestionChips.forEach(chip => {
    chip.addEventListener("click", () => {
      const cmd = chip.getAttribute("data-cmd");
      inputField.value = cmd;
      sendCopilotMessage();
    });
  });

  // Input submit
  inputField.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendCopilotMessage();
    }
  });

  sendBtn.addEventListener("click", sendCopilotMessage);

  // --- Voice Assistant Speech Recognition Bindings ---
  const micBtn = document.getElementById("btn-copilot-mic");
  let recognition = null;
  let isListening = false;

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRecognition && micBtn) {
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      isListening = true;
      micBtn.classList.add("listening");
      micBtn.setAttribute("title", "Listening... Speak now");
      inputField.placeholder = "Listening... Speak now";
    };

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      inputField.value = transcript;
      sendCopilotMessage();
    };

    recognition.onerror = (event) => {
      console.error("Speech recognition error", event.error);
      addSystemChatMessage(`Speech error: ${event.error}`, "error");
    };

    recognition.onend = () => {
      isListening = false;
      micBtn.classList.remove("listening");
      micBtn.setAttribute("title", "Voice Assistant (Click to Speak)");
      inputField.placeholder = "Ask or command the scheduler...";
    };

    micBtn.addEventListener("click", () => {
      if (isListening) {
        recognition.stop();
      } else {
        recognition.start();
      }
    });
  } else if (micBtn) {
    micBtn.style.opacity = "0.5";
    micBtn.setAttribute("title", "Speech Recognition is not supported by your browser (Use Chrome or Edge)");
    micBtn.addEventListener("click", () => {
      alert("Voice Assistant Speech Recognition is not supported by your browser. Please try Google Chrome or Microsoft Edge.");
    });
  }

  // --- Importer step syncing & AI processing ---
  const instStep1 = document.getElementById("importer-instructions");
  const instStep2 = document.getElementById("importer-instructions-step2");
  if (instStep1 && instStep2) {
    instStep1.addEventListener("input", () => {
      instStep2.value = instStep1.value;
    });
    instStep2.addEventListener("input", () => {
      instStep1.value = instStep2.value;
    });
  }

  const aiProcessBtn = document.getElementById("btn-importer-ai-process");
  if (aiProcessBtn) {
    aiProcessBtn.addEventListener("click", async () => {
      if (copilot.config.provider === "local" || !copilot.config.apiKey) {
        alert("AI Copilot Timetable Importer requires an active API Key. Please open the Copilot chat drawer (bottom right button), click settings, and configure your Gemini or OpenAI API Key first!");
        return;
      }

      const instructions = instStep2.value.trim();
      if (!parsedRawText || parsedRawText.trim() === "") {
        alert("No raw text was found to process. Please upload a PDF, CSV, or Image first.");
        return;
      }

      const loader = document.getElementById("importer-loader");
      const loaderTitle = document.getElementById("importer-loader-title");
      const loaderSub = document.getElementById("importer-loader-subtitle");
      const progressContainer = document.getElementById("ocr-progress-container");

      loader.style.display = "flex";
      progressContainer.style.display = "none";
      loaderTitle.textContent = "AI Copilot Processing Timetable...";
      loaderSub.textContent = "Analyzing structure, resolving entities, and applying constraint overrides...";

      try {
        await copilot.parseUploadedTimetable(parsedRawText, instructions);

        alert("Success! The AI Copilot successfully processed the timetable, updated the database entities, and registered the imported sessions!");

        // Reset step views
        document.getElementById("importer-upload-step").style.display = "block";
        document.getElementById("importer-mapping-step").style.display = "none";
        instStep1.value = "";
        instStep2.value = "";

        // Reload page to force refresh all states
        window.location.reload();

      } catch (err) {
        alert(`AI Importer Error: ${err.message}`);
      } finally {
        loader.style.display = "none";
      }
    });
  }

  // Initial greetings
  addSystemChatMessage("Copilot local matching engine initialized.", "info");
  addBotChatMessage("Hello! I am your Scheduler AI Copilot. You can ask me to reschedule sessions, register new resources, clear databases, or switch between view panels. Open my settings tab to enable LLM-powered Gemini/OpenAI controls!");
}

function updateHeaderStatusBadge() {
  const badge = document.getElementById("copilot-status-badge");
  if (!badge) return;
  const provider = copilot.config.provider;
  if (provider === "local") {
    badge.innerHTML = `<span class="status-indicator-dot" style="background:#64748b;display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;"></span> Offline Engine`;
  } else {
    const model = copilot.config.model;
    badge.innerHTML = `<span class="status-indicator-dot active" style="background:#a855f7;display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;"></span> AI Online (${model})`;
  }
}

function addSystemChatMessage(text, type = "info") {
  const chatHistory = document.getElementById("copilot-chat-history");
  if (!chatHistory) return;
  const div = document.createElement("div");
  div.className = `chat-msg system ${type}`;
  div.textContent = text;
  chatHistory.appendChild(div);
  chatHistory.scrollTop = chatHistory.scrollHeight;
}

function addBotChatMessage(text) {
  const chatHistory = document.getElementById("copilot-chat-history");
  if (!chatHistory) return;
  const div = document.createElement("div");
  div.className = "chat-msg bot";
  // Parse simple markdown links & bolding
  let formattedText = text
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");

  div.innerHTML = `
    <div class="msg-content">${formattedText}</div>
    <span class="chat-msg-time">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
  `;
  chatHistory.appendChild(div);
  chatHistory.scrollTop = chatHistory.scrollHeight;
  lucide.createIcons();
}

function addUserChatMessage(text) {
  const chatHistory = document.getElementById("copilot-chat-history");
  if (!chatHistory) return;
  const div = document.createElement("div");
  div.className = "chat-msg user";
  div.innerHTML = `
    <div class="msg-content">${text}</div>
    <span class="chat-msg-time">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
  `;
  chatHistory.appendChild(div);
  chatHistory.scrollTop = chatHistory.scrollHeight;
}

async function sendCopilotMessage() {
  const inputField = document.getElementById("copilot-input-text");
  if (!inputField) return;
  const query = inputField.value.trim();
  if (query === "") return;

  addUserChatMessage(query);
  inputField.value = "";

  // Show loading indicator in chat
  const chatHistory = document.getElementById("copilot-chat-history");
  if (!chatHistory) return;
  const loadingDiv = document.createElement("div");
  loadingDiv.className = "chat-msg bot loading-msg";
  loadingDiv.innerHTML = `
    <div class="loading-dots">
      <span></span>
      <span></span>
      <span></span>
    </div>
  `;
  chatHistory.appendChild(loadingDiv);
  chatHistory.scrollTop = chatHistory.scrollHeight;

  try {
    const res = await copilot.sendMessage(query);
    loadingDiv.remove();

    if (res.success) {
      if (res.action === "reschedule_inquiry") {
        const activeSchedule = db.getActiveSchedule();
        if (!activeSchedule) {
          addBotChatMessage("I couldn't find an active schedule to run suggestions on.");
          return;
        }

        const params = res.params || {};
        let matchingSessions = activeSchedule.sessions;

        // Narrow by teacher
        if (params.teacherName) {
          const teachers = db.getAll("teachers");
          const matchingTeachers = teachers.filter(t =>
            t.name.toLowerCase().includes(params.teacherName.toLowerCase())
          );
          const tIds = matchingTeachers.map(t => t.id);
          if (tIds.length > 0) {
            matchingSessions = matchingSessions.filter(s => tIds.includes(s.teacherId));
          }
        }

        // Narrow by course code or name
        if (params.courseCode || params.courseName) {
          const searchStr = (params.courseCode || params.courseName).toLowerCase();
          matchingSessions = matchingSessions.filter(s =>
            (s.courseCode && s.courseCode.toLowerCase().includes(searchStr)) ||
            (s.courseName && s.courseName.toLowerCase().includes(searchStr))
          );
        }

        // Narrow by day
        if (params.dayName) {
          const dayIndex = db.timeSettings.days.findIndex(d =>
            d.toLowerCase().includes(params.dayName.toLowerCase())
          );
          if (dayIndex !== -1) {
            matchingSessions = matchingSessions.filter(s => s.day === dayIndex);
          }
        }

        // Narrow by period or time (e.g. 11, Period 7)
        if (params.periodName) {
          const timeStr = params.periodName.toLowerCase();
          let matchSlot = -1;
          if (timeStr.includes("11") || timeStr.includes("period 7")) {
            matchSlot = 6;
          } else if (timeStr.includes("8") || timeStr.includes("period 1")) {
            matchSlot = 0;
          } else if (timeStr.includes("9") || timeStr.includes("period 3")) {
            matchSlot = 2;
          } else if (timeStr.includes("10") || timeStr.includes("period 5")) {
            matchSlot = 4;
          } else if (timeStr.includes("12") || timeStr.includes("period 9")) {
            matchSlot = 8;
          } else if (timeStr.includes("2") || timeStr.includes("period 12")) {
            matchSlot = 11;
          } else if (timeStr.includes("3") || timeStr.includes("period 14")) {
            matchSlot = 13;
          }
          if (matchSlot !== -1) {
            matchingSessions = matchingSessions.filter(s => Math.abs(s.slot - matchSlot) <= 1);
          }
        }

        // Fallback text match query if still empty
        if (matchingSessions.length === 0) {
          const queryText = (params.query || query).toLowerCase();
          matchingSessions = activeSchedule.sessions.filter(s => {
            const teacher = db.getById("teachers", s.teacherId);
            const tName = teacher ? teacher.name.toLowerCase() : "";
            return (s.courseCode && s.courseCode.toLowerCase().includes(queryText)) ||
              (s.courseName && s.courseName.toLowerCase().includes(queryText)) ||
              tName.includes(queryText);
          });
        }

        if (matchingSessions.length === 0) {
          addBotChatMessage(`I couldn't identify the specific class session you want to reschedule. Please tell me the course code (e.g. **CS103**) or teacher name.`);
          return;
        }

        // We choose the first matching session to calculate suggestions for
        const targetSession = matchingSessions[0];
        const suggestions = getConflictFreeSlotsForSession(targetSession);

        renderRescheduleSuggestions(targetSession, suggestions);
      } else {
        addBotChatMessage(res.feedback);
      }
    } else {
      addSystemChatMessage(res.feedback, "error");
    }
  } catch (err) {
    loadingDiv.remove();
    addSystemChatMessage(`Error: ${err.message}`, "error");
  }
}

// ================= VOICE ASSISTANT HELPERS ================= //

function getConflictFreeSlotsForSession(session) {
  const activeSchedule = db.getActiveSchedule();
  if (!activeSchedule || !session) return [];

  const course = db.getById("courses", session.courseId);
  const roomType = course ? course.roomType : "lecture";

  const originalDay = session.day;
  const originalSlot = session.slot;
  const originalRoomId = session.roomId;

  const validSlots = [];
  const days = db.timeSettings.days;
  const slotsPerDay = db.timeSettings.slotsPerDay;
  const compatibleRooms = db.getAll("rooms").filter(r => r.type === roomType);

  // Iterate over every day and slot to test
  for (let d = 0; d < days.length; d++) {
    for (let s = 0; s < slotsPerDay; s++) {
      // Skip the lunch slot S-11 (index 10)
      if (s === 10) continue;

      // Ensure the session fits within the day duration (doesn't bleed past slot 15)
      const duration = roomType === "lab" ? (s === 0 ? 6 : (s === 11 ? 4 : 6)) : 3;
      if (s + duration > slotsPerDay) continue;

      // Don't cross the lunch break slot S-11 (index 10)
      let crossesLunch = false;
      for (let i = 0; i < duration; i++) {
        if (s + i === 10) {
          crossesLunch = true;
          break;
        }
      }
      if (crossesLunch) continue;

      // Check rooms of the same type for this slot
      for (let room of compatibleRooms) {
        session.roomId = room.id;
        session.day = d;
        session.slot = s;

        const audit = Scheduler.checkConflicts(activeSchedule.sessions, db);
        const hasConflictsForSession = audit.conflicts.some(conflict =>
          conflict.sessionIds && conflict.sessionIds.includes(session.id)
        );

        if (!hasConflictsForSession) {
          validSlots.push({ day: d, slot: s, roomId: room.id, roomName: room.name });
          break; // Stop looking for other rooms for this slot to avoid duplicates
        }
      }
    }
  }

  // Restore session back to original settings
  session.day = originalDay;
  session.slot = originalSlot;
  session.roomId = originalRoomId;

  return validSlots;
}

function renderRescheduleSuggestions(session, suggestions) {
  const chatHistory = document.getElementById("copilot-chat-history");
  if (!chatHistory) return;

  const div = document.createElement("div");
  div.className = "chat-msg bot";

  const course = db.getById("courses", session.courseId);
  const teacher = db.getById("teachers", session.teacherId);
  const originalDayName = db.timeSettings.days[session.day];
  const originalTimeStr = db.timeSettings.slotTimes[session.slot];

  let headerHtml = `I found the session: <strong>${course ? course.name : session.courseCode}</strong> taught by <strong>${teacher ? teacher.name : "Instructor"}</strong>, currently on <strong>${originalDayName} at ${originalTimeStr}</strong>.<br><br>`;

  if (suggestions.length === 0) {
    headerHtml += `Unfortunately, I couldn't find any 100% conflict-free alternative slots for this class session. You may need to manually resolve clashes or adjust availability settings.`;
    div.innerHTML = `<div class="msg-content">${headerHtml}</div>`;
  } else {
    headerHtml += `Here are the conflict-free slots where this class can be arranged. Select one to apply it immediately:`;

    let cardsHtml = `<div class="voice-suggestion-container">`;
    // Show top 5 suggestions
    suggestions.slice(0, 5).forEach((sug, idx) => {
      const dayName = db.timeSettings.days[sug.day];
      const timeStr = db.timeSettings.slotTimes[sug.slot];
      const room = db.getById("rooms", sug.roomId);
      const roomName = room ? room.name : sug.roomName;

      cardsHtml += `
        <button class="voice-suggestion-card" data-session-id="${session.id}" data-day="${sug.day}" data-slot="${sug.slot}" data-room-id="${sug.roomId}">
          <div class="voice-suggestion-title">
            <i data-lucide="check-circle" style="width: 14px; height: 14px; color: #34d399;"></i>
            Option ${idx + 1}: ${dayName}
          </div>
          <div class="voice-suggestion-details">
            Time: ${timeStr}<br>
            Room: ${roomName}
          </div>
        </button>
      `;
    });
    cardsHtml += `</div>`;

    div.innerHTML = `
      <div class="msg-content">
        ${headerHtml}
        ${cardsHtml}
      </div>
      <span class="chat-msg-time">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
    `;
  }

  chatHistory.appendChild(div);
  chatHistory.scrollTop = chatHistory.scrollHeight;
  lucide.createIcons();

  // Add click listeners to suggestion cards
  const cards = div.querySelectorAll(".voice-suggestion-card");
  cards.forEach(card => {
    card.addEventListener("click", () => {
      const sessId = card.getAttribute("data-session-id");
      const targetDay = parseInt(card.getAttribute("data-day"), 10);
      const targetSlot = parseInt(card.getAttribute("data-slot"), 10);
      const targetRoomId = card.getAttribute("data-room-id");

      applyVoiceReschedule(sessId, targetDay, targetSlot, targetRoomId);
    });
  });
}

function applyVoiceReschedule(sessId, targetDay, targetSlot, targetRoomId) {
  const activeSchedule = db.getActiveSchedule();
  if (!activeSchedule) return;

  const session = activeSchedule.sessions.find(s => s.id === sessId);
  if (!session) return;

  const course = db.getById("courses", session.courseId);
  const room = db.getById("rooms", targetRoomId);
  const dayName = db.timeSettings.days[targetDay];
  const slotTimeStr = db.timeSettings.slotTimes[targetSlot];

  // Apply changes to database
  session.day = targetDay;
  session.slot = targetSlot;
  session.roomId = targetRoomId;
  db.save();

  // Refresh page visual states
  updateDashboardStats();
  renderTeachersList();
  renderCoursesList();
  renderRoomsList();
  renderSectionsList();
  initFormSelects();
  if (currentView === "schedule") {
    renderScheduleGrid();
  }
  runConflictAudit();

  // Add success chat message
  const msg = `Successfully rescheduled **${course ? course.name : session.courseCode}** to **${dayName} at ${slotTimeStr}** in room **${room ? room.name : "classroom"}**!`;
  addBotChatMessage(msg);

  // Play voice synthesis confirmation out loud!
  const voiceMsg = `Success! I have moved the class ${course ? course.name : ""} to ${dayName} at ${slotTimeStr.split("(")[0]} in room ${room ? room.name : ""}`;
  speakConfirmation(voiceMsg);
}

function speakConfirmation(text) {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.volume = 1.0;
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    const voices = window.speechSynthesis.getVoices();
    const voice = voices.find(v => v.lang.startsWith("en")) || voices[0];
    if (voice) utterance.voice = voice;

    window.speechSynthesis.speak(utterance);
  }
}
