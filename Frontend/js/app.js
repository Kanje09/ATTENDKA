function logout() {
  window.attendkaApi.clearSession();
  window.location.href = "index.html";
}

document.addEventListener("DOMContentLoaded", async () => {
  const $ = (selector) => document.querySelector(selector);
  const byId = (id) => document.getElementById(id);
  const setText = (id, value) => {
    const element = byId(id);
    if (element) element.textContent = value ?? "";
  };
  const on = (id, event, handler) => {
    const element = byId(id);
    if (element) element.addEventListener(event, handler);
  };
  const api = window.attendkaApi;
  const dashboard = byId("dashboard");
  const reportPage = byId("reports");
  reportPage?.querySelector(".profile")?.remove();
  reportPage?.querySelector(".grid-top")?.remove();
  reportPage?.querySelector(".grid-mid")?.remove();
  reportPage?.querySelector(":scope > .report-cards")?.remove();
  reportPage?.querySelector(":scope > .panel:not(:first-of-type)")?.remove();
  byId("admin")
    ?.querySelectorAll(".stats, .charts, .grid-top, .grid-mid, .report-cards")
    .forEach((element) => element.remove());
  dashboard?.querySelectorAll(".stats .value").forEach((element) => {
    element.textContent = "—";
  });
  dashboard?.querySelector(".stats .change")?.remove();
  if (!localStorage.getItem("ptci_access_token")) {
    window.location.replace("index.html");
    return;
  }

  let currentUser;
  try {
    const result = await api.request("/auth/me");
    currentUser = result.user;
    // Don't store the (large) photo in localStorage
    const { photo: _photo, ...userForStorage } = currentUser;
    localStorage.setItem("ptci_user", JSON.stringify(userForStorage));
  } catch {
    api.clearSession();
    window.location.replace("index.html");
    return;
  }

  const roleLabels = {
    student: "Student",
    teacher: "Teacher",
    admin: "Administrator",
    team_leader: "Team Leader",
  };
  const fullName = [
    currentUser.first_name,
    currentUser.middle_name,
    currentUser.last_name,
  ]
    .filter(Boolean)
    .join(" ");
  const initials =
    `${currentUser.first_name?.[0] || ""}${currentUser.last_name?.[0] || ""}`.toUpperCase() ||
    "U";
  setText("userName", fullName);
  setText("topUserName", fullName);
  setText("userRole", roleLabels[currentUser.role] || currentUser.role);
  setText("topUserRole", roleLabels[currentUser.role] || currentUser.role);
  setText("avatar", initials);
  setText("topAvatar", initials);
  setText("bigAvatar", initials);
  setText("dashName", fullName);
  setText("dashEmail", currentUser.email || "No email added");
  setText("setRole", roleLabels[currentUser.role] || currentUser.role);
  setText("setId", currentUser.student_no || currentUser.employee_no || "—");
  if (byId("setFirst")) byId("setFirst").value = currentUser.first_name || "";
  if (byId("setLast")) byId("setLast").value = currentUser.last_name || "";
  if (byId("setEmail")) byId("setEmail").value = currentUser.email || "";

  const isAdmin = currentUser.role === "admin";
  const isStaff = isAdmin || currentUser.role === "teacher";
  const isStudent =
    currentUser.role === "student" || currentUser.role === "team_leader";
  const content = $(".content");
  for (const pageId of [
    "event-management",
    "rfid-management",
    "accounts-management",
    "student-photos",
    "student-events",
    "student-directory",
  ]) {
    const page = byId(pageId);
    if (page && content && page.parentElement !== content) content.append(page);
  }
  function moveManagementSection(formId, targetId) {
    const form = byId(formId);
    const target = byId(targetId);
    const section = form?.closest("section");
    if (section && target) target.append(section);
  }
  if (isAdmin) {
    moveManagementSection("eventForm", "eventManagementContent");
    moveManagementSection("readerForm", "rfidManagementContent");
    moveManagementSection("cardForm", "rfidManagementContent");
    moveManagementSection("departmentForm", "accountsManagementContent");
    moveManagementSection("staffForm", "accountsManagementContent");
    moveManagementSection("adminUserList", "accountsManagementContent");
    moveManagementSection("studentPhotoFileForm", "studentPhotosContent");
    if (byId("rfidEventAssignment") && byId("rfidAssignmentPageSlot")) {
      byId("rfidAssignmentPageSlot").append(byId("rfidEventAssignment"));
    }
    if (byId("admin")) byId("admin").hidden = true;
    document
      .querySelector('.nav-item[data-page="admin"]')
      ?.setAttribute("hidden", "");
  }
  const avatarKey = `attendka_avatar_${currentUser.user_id}`;
  const savedAvatar = !isStudent ? localStorage.getItem(avatarKey) : null;
  function setAvatar(element, source, fallback = initials) {
    if (!element) return;
    element.style.backgroundImage = source ? `url("${source}")` : "";
    element.style.backgroundSize = source ? "cover" : "";
    element.style.backgroundPosition = source ? "center" : "";
    const child = element.querySelector("span");
    if (child) {
      child.textContent = fallback;
      child.hidden = Boolean(source);
    } else {
      element.textContent = source ? "" : fallback;
    }
  }
  if (savedAvatar) {
    setAvatar(byId("avatar"), savedAvatar);
    setAvatar(document.querySelector(".big-avatar"), savedAvatar);
  }

  if (isStudent && currentUser.photo) {
    setAvatar(byId("avatar"), currentUser.photo);
    setAvatar(document.querySelector(".big-avatar"), currentUse r.photo);
  }

  if (isStudent) {
    document.querySelector(".topbar .search")?.setAttribute("hidden", "");
    document.querySelector(".avatar-actions")?.setAttribute("hidden", "");
  }
  const masterlistsPage = byId("masterlists");
  if (masterlistsPage) masterlistsPage.hidden = !isAdmin;
  const adviserPage = byId("team-adviser");
  if (adviserPage) adviserPage.hidden = currentUser.role !== "teacher";
  if (byId("eventList")?.closest(".calendar-events"))
    byId("eventList").closest(".calendar-events").hidden = isStudent;
  if (byId("rfidEventAssignment"))
    byId("rfidEventAssignment").hidden = !isAdmin;
  if (byId("studentEventList")) {
    byId("studentEventList").closest(".panel").hidden = !isStudent;
  }
  if (isStudent) {
    document
      .querySelectorAll(
        '.nav-item[data-page="attendance"], .nav-item[data-page="reports"]',
      )
      .forEach((item) => {
        item.hidden = true;
      });
    if (byId("attendance")) byId("attendance").hidden = true;
    if (byId("reports")) byId("reports").hidden = true;
  }
  document.querySelectorAll('.nav-item[data-page="admin"]').forEach((item) => {
    item.hidden = !isAdmin;
  });
  if (byId("masterlistsNav")) byId("masterlistsNav").hidden = !isAdmin;
  for (const id of [
    "eventsNav",
    "rfidNav",
    "accountsNav",
    "studentPhotosNav",
  ]) {
    if (byId(id)) byId(id).hidden = !isAdmin;
  }
  for (const pageId of [
    "event-management",
    "rfid-management",
    "accounts-management",
    "student-photos",
  ]) {
    if (byId(pageId)) byId(pageId).hidden = !isAdmin;
  }
  if (byId("teamAdviserNav"))
    byId("teamAdviserNav").hidden = currentUser.role !== "teacher";
  if (byId("studentEventsNav")) byId("studentEventsNav").hidden = !isStudent;
  if (byId("student-events")) byId("student-events").hidden = !isStudent;
  const calendarNav = document.querySelector('.nav-item[data-page="calendar"]');
  if (calendarNav) {
    const label = calendarNav.querySelector(".label");
    if (label) label.textContent = "School calendar";
  }
  if (byId("studentDirectoryNav"))
    byId("studentDirectoryNav").hidden = !isStaff;
  if (byId("student-directory")) byId("student-directory").hidden = !isStaff;
  if (byId("settingsNav") && isStudent) byId("settingsNav").hidden = true;
  if (isStudent && byId("settings")) byId("settings").hidden = true;
  document
    .querySelectorAll(
      '.nav-item[data-page="attendance"], .nav-item[data-page="reports"]',
    )
    .forEach((item) => {
      item.hidden = !isStaff;
    });
  const liveLink = byId("liveDisplayLink");
  if (liveLink) liveLink.hidden = !isStaff;
  const studentPanel = byId("studentDashboard");
  const staffData = byId("staffDashboardData");
  if (studentPanel) studentPanel.hidden = !isStudent;
  if (staffData) staffData.hidden = !isStaff;
  if (isStudent && dashboard) {
    dashboard.querySelectorAll(".stats, .charts").forEach((element) => {
      element.hidden = true;
    });
    const header = dashboard.querySelector(".page-header");
    if (header) {
      header.querySelector("h2").textContent = "My student dashboard";
      header.querySelector(".sub").textContent = `Welcome, ${fullName}`;
      const action = header.querySelector(".header-actions");
      if (action) action.hidden = true;
    }
    if (byId("resetLiveAttendance"))
      byId("resetLiveAttendance").hidden = !isAdmin;
  }

  function showPage(pageId) {
    const page = byId(pageId);
    if (!page || page.hidden) return;
    document
      .querySelectorAll(".page")
      .forEach((element) => element.classList.remove("active"));
    document.querySelectorAll(".nav-item[data-page]").forEach((item) => {
      item.classList.toggle(
        "active",
        item.getAttribute("data-page") === pageId,
      );
    });
    page.classList.add("active");
    const content = $(".content");
    if (content) content.scrollTop = 0;
  }

  document.querySelectorAll(".nav-item[data-page]").forEach((item) => {
    item.addEventListener("click", () =>
      showPage(item.getAttribute("data-page")),
    );
  });
  document.querySelectorAll("[data-goto]").forEach((button) => {
    button.addEventListener("click", () =>
      showPage(button.getAttribute("data-goto")),
    );
  });

  const toggle = byId("sbToggle");
  if (window.innerWidth <= 768) document.body.classList.add("sb-collapsed");
  toggle?.addEventListener("click", () => {
    const collapsed = document.body.classList.toggle("sb-collapsed");
    toggle.setAttribute(
      "aria-label",
      collapsed ? "Expand sidebar" : "Collapse sidebar",
    );
  });

  function updateTime() {
    const now = new Date();
    const value = new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
    }).format(now);
    ["time", "time2", "time3", "clock"].forEach((id) => setText(id, value));
  }
  updateTime();
  window.setInterval(updateTime, 30000);

  document.querySelectorAll(".settings-btn[data-tab]").forEach((button) => {
    button.addEventListener("click", function () {
      document
        .querySelectorAll(".settings-btn")
        .forEach((item) => item.classList.remove("active"));
      document
        .querySelectorAll(".settings-pane")
        .forEach((item) => item.classList.remove("active"));
      this.classList.add("active");
      byId(this.getAttribute("data-tab"))?.classList.add("active");
    });
  });

  byId("avatarFile")?.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (!file || isStudent) return;
    if (!file.type.startsWith("image/") || file.size > 2 * 1024 * 1024) {
      setText("profileMessage", "Choose an image smaller than 2 MB.");
      return;
    }
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result !== "string") return;
      try {
        localStorage.setItem(avatarKey, reader.result);
      } catch {
        setText(
          "profileMessage",
          "This image is too large for browser storage. Choose a smaller image.",
        );
        return;
      }
      setAvatar(byId("avatar"), reader.result);
      setAvatar(document.querySelector(".big-avatar"), reader.result);
      setText("profileMessage", "Avatar saved in this browser.");
      byId("profileMessage")?.classList.add("success");
    });
    reader.readAsDataURL(file);
  });
  on("deleteAvatar", "click", () => {
    if (isStudent) return;
    localStorage.removeItem(avatarKey);
    setAvatar(byId("avatar"), "");
    setAvatar(document.querySelector(".big-avatar"), "");
    setText("profileMessage", "Avatar removed from this browser.");
    byId("profileMessage")?.classList.add("success");
  });

  const profileForm = byId("profileForm");
  profileForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = byId("profileMessage");
    try {
      const result = await api.request("/auth/me", {
        method: "PATCH",
        body: JSON.stringify({
          first_name: byId("setFirst").value.trim(),
          last_name: byId("setLast").value.trim(),
          email: byId("setEmail").value.trim() || null,
        }),
      });
      currentUser = { ...currentUser, ...result.user };
      const { photo: _photo, ...userForStorage } = currentUser;
      localStorage.setItem("ptci_user", JSON.stringify(userForStorage));
      setText("userName", `${currentUser.first_name} ${currentUser.last_name}`);
      setText(
        "topUserName",
        `${currentUser.first_name} ${currentUser.last_name}`,
      );
      setText("dashName", `${currentUser.first_name} ${currentUser.last_name}`);
      setText("profileMessage", "Profile updated.");
      message?.classList.add("success");
    } catch (error) {
      setText("profileMessage", error.message);
      message?.classList.remove("success");
    }
  });

  byId("passwordForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = byId("passwordMessage");
    const newPassword = byId("pwNew").value;
    if (newPassword !== byId("pwConfirm").value) {
      setText("passwordMessage", "New passwords do not match.");
      return;
    }
    try {
      const result = await api.request("/auth/password", {
        method: "POST",
        body: JSON.stringify({
          current_password: byId("pwOld").value,
          new_password: newPassword,
        }),
      });
      setText(
        "passwordMessage",
        result.message === "password_updated"
          ? "Password updated."
          : "Password updated.",
      );
      message?.classList.add("success");
      byId("passwordForm").reset();
    } catch (error) {
      setText("passwordMessage", error.message);
      message?.classList.remove("success");
    }
  });

  function escapeHtml(value) {
    return String(value ?? "").replace(
      /[&<>"']/g,
      (character) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[character],
    );
  }
  function formatDate(value) {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  }
  function setFormMessage(id, text, success = false) {
    const element = byId(id);
    if (!element) return;
    element.textContent = text;
    element.classList.toggle("success", success);
  }
  async function submitForm(form, messageId, action) {
    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = form.querySelector('[type="submit"]');
      if (button) button.disabled = true;
      setFormMessage(messageId, "Saving…");
      try {
        await action();
        form.reset();
        setFormMessage(messageId, "Saved successfully.", true);
      } catch (error) {
        setFormMessage(messageId, error.message);
      } finally {
        if (button) button.disabled = false;
      }
    });
  }

  async function loadDepartments() {
    const result = await api.request("/departments");
    for (const id of [
      "staffDepartment",
      "eventDepartment",
      "masterlistDepartment",
      "fCourse",
      "directoryDepartment",
      "editStudentDepartment",
      "managedDepartment",
    ]) {
      const select = byId(id);
      if (!select) continue;
      const firstOption = select.options[0];
      select.replaceChildren(firstOption);
      const departments =
        id === "fCourse" && currentUser.role === "teacher"
          ? result.departments.filter(
              (department) =>
                department.department_id === currentUser.teaching_department_id,
            )
          : result.departments;
      departments.forEach((department) => {
        select.add(
          new Option(
            `${department.code} — ${department.name}`,
            department.department_id,
          ),
        );
      });
    }
    for (const id of [
      "directoryYear",
      "masterlistCandidateYear",
      "teamCandidateYear",
    ]) {
      const select = byId(id);
      if (!select) continue;
      select.replaceChildren(new Option("All year levels", ""));
      for (let year = 1; year <= 10; year += 1) {
        select.add(new Option(`Year ${year}`, String(year)));
      }
    }
  }

  function configureStaffRole() {
    const isTeacher = byId("staffRole")?.value === "teacher";
    if (byId("teacherFields")) byId("teacherFields").hidden = !isTeacher;
    if (byId("adminFields")) byId("adminFields").hidden = isTeacher;
    if (byId("staffEmployeeNo")) byId("staffEmployeeNo").required = isTeacher;
    if (byId("staffDepartment")) byId("staffDepartment").required = isTeacher;
  }
  byId("staffRole")?.addEventListener("change", configureStaffRole);
  configureStaffRole();

  submitForm(byId("departmentForm"), null, async () => {
    await api.request("/admin/departments", {
      method: "POST",
      body: JSON.stringify({
        code: byId("departmentCode").value.trim(),
        name: byId("departmentName").value.trim(),
      }),
    });
    await loadDepartments();
  });

  submitForm(byId("staffForm"), "staffMessage", async () => {
    const role = byId("staffRole").value;
    await api.request("/admin/users", {
      method: "POST",
      body: JSON.stringify({
        role,
        first_name: byId("staffFirst").value.trim(),
        last_name: byId("staffLast").value.trim(),
        username: byId("staffUsername").value.trim(),
        email: byId("staffEmail").value.trim() || undefined,
        password: byId("staffPassword").value,
        ...(role === "teacher"
          ? {
              employee_no: byId("staffEmployeeNo").value.trim(),
              department_id: Number(byId("staffDepartment").value),
              year_level: byId("staffYearLevel").value
                ? Number(byId("staffYearLevel").value)
                : null,
            }
          : {
              position: byId("staffPosition").value.trim() || undefined,
            }),
      }),
    });
    await loadAdminUsers();
  });

  submitForm(byId("readerForm"), "readerMessage", async () => {
    const result = await api.request("/admin/readers", {
      method: "POST",
      body: JSON.stringify({
        reader_name: byId("readerName").value.trim(),
        location: byId("readerLocation").value.trim() || null,
      }),
    });
    await loadRfidReaders();
    // Show the device key AFTER submitForm's own success message
    window.setTimeout(() => {
      setFormMessage(
        "readerMessage",
        `Reader created. Copy its device key now: ${result.device_key}`,
        true,
      );
    }, 0);
  });

  submitForm(byId("cardForm"), "cardMessage", async () => {
    await api.request("/admin/cards", {
      method: "POST",
      body: JSON.stringify({
        student_id: Number(byId("cardStudentId").value),
        card_uid: byId("cardUid").value.trim(),
      }),
    });
    await loadRfidCards();
  });

  let selectedStudentPhotoFile = null;
  let studentPhotoPreviewUrl = "";
  function clearStudentPhotoPreviewUrl() {
    if (studentPhotoPreviewUrl) URL.revokeObjectURL(studentPhotoPreviewUrl);
    studentPhotoPreviewUrl = "";
  }
  function showStudentPhotoPreview(source, label) {
    const preview = byId("studentPhotoPreview");
    if (!preview) return;
    preview.replaceChildren();
    if (!source) {
      preview.textContent = label || "Photo preview";
      return;
    }
    const image = document.createElement("img");
    image.alt = "Selected student photo preview";
    image.src = source;
    image.addEventListener(
      "error",
      () => {
        preview.textContent = "The photo could not be loaded.";
      },
      { once: true },
    );
    preview.append(image);
  }

  byId("photoStudent")?.addEventListener("change", async () => {
    clearStudentPhotoPreviewUrl();
    const userId = Number(byId("photoStudent").value);
    selectedStudentPhotoFile = null;
    if (byId("studentPhotoFile")) byId("studentPhotoFile").value = "";
    if (byId("studentPhotoFilename")) byId("studentPhotoFilename").value = "";
    if (!userId) {
      showStudentPhotoPreview("", "Photo preview");
      return;
    }
    try {
      const result = await api.request(`/admin/students/${userId}/photo`);
      showStudentPhotoPreview(result.photo || "", "No saved photo");
    } catch (error) {
      showStudentPhotoPreview("", error.message);
    }
  });

  byId("studentPhotoFile")?.addEventListener("change", (event) => {
    clearStudentPhotoPreviewUrl();
    selectedStudentPhotoFile = event.target.files?.[0] || null;
    if (selectedStudentPhotoFile) {
      if (byId("studentPhotoFilename"))
        byId("studentPhotoFilename").value = selectedStudentPhotoFile.name;
      studentPhotoPreviewUrl = URL.createObjectURL(selectedStudentPhotoFile);
      showStudentPhotoPreview(studentPhotoPreviewUrl);
    }
  });

  byId("studentPhotoFileForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const userId = Number(byId("photoStudent").value);
    if (!userId) {
      setFormMessage("studentPhotoMessage", "Choose a student first.");
      return;
    }
    try {
      if (!selectedStudentPhotoFile)
        throw new Error("Choose a photo to upload.");
      if (!selectedStudentPhotoFile.type.startsWith("image/")) {
        throw new Error("Choose a valid image file.");
      }
      const bitmap = await createImageBitmap(selectedStudentPhotoFile);
      const scale = Math.min(1, 320 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas
        .getContext("2d")
        .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const source = canvas.toDataURL("image/jpeg", 0.7);

      await api.request(`/admin/students/${userId}/photo`, {
        method: "PUT",
        body: JSON.stringify({ photo: source }),
      });
      clearStudentPhotoPreviewUrl();
      byId("studentPhotoFileForm").reset();
      selectedStudentPhotoFile = null;
      showStudentPhotoPreview(source);
      setFormMessage("studentPhotoMessage", "Student photo saved.", true);
    } catch (error) {
      setFormMessage("studentPhotoMessage", error.message);
    }
  });

  on("removeStudentPhoto", "click", async () => {
    const userId = Number(byId("photoStudent")?.value);
    if (!userId) {
      setFormMessage("studentPhotoMessage", "Choose a student first.");
      return;
    }
    try {
      await api.request(`/admin/students/${userId}/photo`, {
        method: "PUT",
        body: JSON.stringify({ photo: null }),
      });
      clearStudentPhotoPreviewUrl();
      byId("studentPhotoFileForm").reset();
      selectedStudentPhotoFile = null;
      showStudentPhotoPreview("", "No photo selected");
      setFormMessage("studentPhotoMessage", "Student photo removed.", true);
    } catch (error) {
      setFormMessage("studentPhotoMessage", error.message);
    }
  });

  submitForm(byId("masterlistForm"), "masterlistMessage", async () => {
    await api.request("/admin/masterlists", {
      method: "POST",
      body: JSON.stringify({
        department_id: Number(byId("masterlistDepartment").value),
        school_year: byId("masterlistYear").value.trim(),
        semester: byId("masterlistSemester").value,
      }),
    });
    await loadMasterlists();
  });

  submitForm(byId("teamForm"), "teamMessage", async () => {
    await api.request("/admin/teams", {
      method: "POST",
      body: JSON.stringify({
        name: byId("teamName").value.trim(),
        school_year: byId("teamSchoolYear").value.trim(),
      }),
    });
    await loadTeams();
  });

  function asIsoDate(id) {
    const value = byId(id).value;
    if (!value) return null;
    return new Date(value).toISOString();
  }
  submitForm(byId("eventForm"), "eventMessage", async () => {
    await api.request("/events", {
      method: "POST",
      body: JSON.stringify({
        title: byId("eventTitle").value.trim(),
        venue: byId("eventVenue").value.trim() || null,
        event_type: byId("eventType").value,
        start_datetime: asIsoDate("eventStart"),
        end_datetime: asIsoDate("eventEnd"),
        department_id: byId("eventDepartment").value
          ? Number(byId("eventDepartment").value)
          : null,
        points: Number(byId("eventPoints").value || 0),
        requires_attendance: true,
      }),
    });
    await loadEvents();
  });

  async function loadAdminUsers() {
    if (!isAdmin || !byId("adminUserList")) return;
    const container = byId("adminUserList");
    try {
      const result = await api.request("/admin/users");
      container.innerHTML = result.users.length
        ? result.users
            .map(
              (user) => `
          <div class="api-user-row">
            <span class="api-user-avatar">${escapeHtml(`${user.first_name?.[0] || ""}${user.last_name?.[0] || ""}`)}</span>
            <span><strong>${escapeHtml(user.first_name)} ${escapeHtml(user.last_name)}</strong><small>${escapeHtml(user.username)} · ${escapeHtml(roleLabels[user.role] || user.role)}</small></span>
            <span class="api-user-id">#${escapeHtml(user.user_id)}</span>
          </div>`,
            )
            .join("")
        : "No accounts found.";
      const teachers = result.users.filter((user) => user.role === "teacher");
      availableTeachers = teachers;
      const teacherSelect = byId("managedTeacher");
      if (teacherSelect) {
        teacherSelect.replaceChildren(new Option("Select teacher", ""));
        teachers.forEach((teacher) =>
          teacherSelect.add(
            new Option(
              `${teacher.first_name} ${teacher.last_name} · ${teacher.employee_no || teacher.username}`,
              teacher.teacher_id,
            ),
          ),
        );
      }
    } catch (error) {
      container.textContent = error.message;
    }
  }
  let availableTeachers = [];
  on("reloadUsers", "click", () => {
    void loadAdminUsers();
  });

  async function loadStudentDirectory() {
    if (!isStaff) return;
    const query = new URLSearchParams();
    if (byId("directoryDepartment")?.value)
      query.set("department_id", byId("directoryDepartment").value);
    if (byId("directoryYear")?.value)
      query.set("year_level", byId("directoryYear").value);
    if (byId("directorySearch")?.value.trim())
      query.set("search", byId("directorySearch").value.trim());
    const rows = byId("directoryRows");
    try {
      const result = await api.request(
        `/students${query.size ? `?${query}` : ""}`,
      );
      rows.innerHTML = result.students.length
        ? result.students
            .map(
              (student) => `<tr>
            <td>${escapeHtml(`${student.last_name}, ${student.first_name}${student.middle_name ? ` ${student.middle_name}` : ""}`)}</td>
            <td>${escapeHtml(student.student_no)}</td>
            <td>${escapeHtml(student.department_code)}</td>
            <td>${escapeHtml(student.year_level)}</td>
            <td>${escapeHtml(student.section || "—")}</td>
            <td>${isAdmin ? `<button type="button" class="btn edit-student" data-student="${student.student_id}">Edit</button>` : "—"}</td>
          </tr>`,
            )
            .join("")
        : '<tr><td colspan="6" class="empty">No students match your filters.</td></tr>';
      rows.dataset.students = JSON.stringify(result.students);
    } catch (error) {
      rows.innerHTML = `<tr><td colspan="6" class="empty">${escapeHtml(error.message)}</td></tr>`;
    }
  }
  let directorySearchTimer;
  on("directorySearch", "input", () => {
    window.clearTimeout(directorySearchTimer);
    directorySearchTimer = window.setTimeout(() => {
      void loadStudentDirectory();
    }, 250);
  });
  on("directoryDepartment", "change", () => {
    void loadStudentDirectory();
  });
  on("directoryYear", "change", () => {
    void loadStudentDirectory();
  });
  byId("directoryRows")?.addEventListener("click", (event) => {
    const button = event.target.closest(".edit-student");
    if (!button || !isAdmin) return;
    const students = JSON.parse(byId("directoryRows").dataset.students || "[]");
    const student = students.find(
      (item) => String(item.student_id) === button.dataset.student,
    );
    if (!student) return;
    byId("editStudentId").value = student.student_id;
    byId("editStudentFirst").value = student.first_name || "";
    byId("editStudentMiddle").value = student.middle_name || "";
    byId("editStudentLast").value = student.last_name || "";
    byId("editStudentEmail").value = student.email || "";
    byId("editStudentNo").value = student.student_no || "";
    byId("editStudentDepartment").value = student.department_id;
    byId("editStudentYear").value = student.year_level;
    byId("editStudentSection").value = student.section || "";
    byId("studentEditPanel").hidden = false;
    byId("studentEditPanel").scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  });
  byId("cancelStudentEdit")?.addEventListener("click", () => {
    byId("studentEditPanel").hidden = true;
  });
  byId("studentEditForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const studentId = byId("editStudentId").value;
    try {
      await api.request(`/admin/students/${studentId}`, {
        method: "PUT",
        body: JSON.stringify({
          first_name: byId("editStudentFirst").value.trim(),
          middle_name: byId("editStudentMiddle").value.trim() || null,
          last_name: byId("editStudentLast").value.trim(),
          email: byId("editStudentEmail").value.trim() || null,
          student_no: byId("editStudentNo").value.trim(),
          department_id: Number(byId("editStudentDepartment").value),
          year_level: Number(byId("editStudentYear").value),
          section: byId("editStudentSection").value.trim() || null,
        }),
      });
      setFormMessage("studentEditMessage", "Student updated.", true);
      await loadStudentDirectory();
      await loadStudentChoices();
    } catch (error) {
      setFormMessage("studentEditMessage", error.message);
    }
  });

  on("managedTeacher", "change", () => {
    const teacher = availableTeachers.find(
      (item) => String(item.teacher_id) === byId("managedTeacher").value,
    );
    if (!teacher) return;
    byId("managedDepartment").value = teacher.teaching_department_id || "";
    byId("managedYear").value = teacher.teaching_year_level || "";
  });
  on("saveTeacherAssignment", "click", async () => {
    const teacherId = byId("managedTeacher").value;
    try {
      if (!teacherId || !byId("managedDepartment").value)
        throw new Error("Choose a teacher and department.");
      await api.request(`/admin/teachers/${teacherId}/department`, {
        method: "PATCH",
        body: JSON.stringify({
          department_id: Number(byId("managedDepartment").value),
          year_level: byId("managedYear").value
            ? Number(byId("managedYear").value)
            : null,
        }),
      });
      setFormMessage(
        "teacherAssignmentMessage",
        "Teacher department and year assignment saved.",
        true,
      );
      await loadAdminUsers();
    } catch (error) {
      setFormMessage("teacherAssignmentMessage", error.message);
    }
  });

  function renderStudentChoices(container, students, checked = () => false) {
    if (!students.length) {
      container.textContent = "No students found for this masterlist.";
      return;
    }
    const groups = new Map();
    students.forEach((student) => {
      const groupName = `${student.department_code || student.department || "Department"} · Year ${student.year_level}`;
      groups.set(groupName, [...(groups.get(groupName) || []), student]);
    });
    container.innerHTML = `<label class="masterlist-select-all"><input type="checkbox" class="student-select-all"> Select all visible</label>${Array.from(
      groups,
      ([groupName, members]) => `
        <section class="student-choice-group"><h4>${escapeHtml(groupName)}</h4>
          ${members
            .map(
              (student) => `
            <label class="api-user-row api-checkbox student-choice-row" data-year="${escapeHtml(student.year_level)}">
              <input type="checkbox" class="student-choice" value="${escapeHtml(student.student_id)}" ${checked(student) ? "checked" : ""}>
              <span><strong>${escapeHtml(student.last_name)}, ${escapeHtml(student.first_name)}</strong>
              <small>${escapeHtml(student.student_no)} · Year ${escapeHtml(student.year_level)} · ${escapeHtml(student.section || "")}</small></span>
            </label>`,
            )
            .join("")}
        </section>`,
    ).join("")}`;
    container
      .querySelector(".student-select-all")
      ?.addEventListener("change", (event) => {
        container
          .querySelectorAll(".student-choice-row:not([hidden]) .student-choice")
          .forEach((input) => {
            input.checked = event.target.checked;
          });
      });
  }

  function applyStudentChoiceFilters(containerId, searchId, yearId) {
    const container = byId(containerId);
    const search = byId(searchId)?.value.trim().toLocaleLowerCase() || "";
    const year = byId(yearId)?.value || "";
    container?.querySelectorAll(".student-choice-row").forEach((row) => {
      row.hidden = Boolean(
        (search && !row.textContent.toLocaleLowerCase().includes(search)) ||
        (year && row.dataset.year !== year),
      );
    });
  }
  for (const [searchId, yearId, containerId] of [
    [
      "masterlistCandidateSearch",
      "masterlistCandidateYear",
      "masterlistCandidates",
    ],
    ["teamCandidateSearch", "teamCandidateYear", "teamCandidates"],
  ]) {
    on(searchId, "input", () =>
      applyStudentChoiceFilters(containerId, searchId, yearId),
    );
    on(yearId, "change", () =>
      applyStudentChoiceFilters(containerId, searchId, yearId),
    );
  }

  let rfidStudents = [];
  async function loadStudentChoices() {
    if (!isAdmin) return;
    const result = await api.request("/students");
    rfidStudents = result.students;
    const photoSelect = byId("photoStudent");
    const cardSelect = byId("cardStudentId");
    if (cardSelect) {
      cardSelect.replaceChildren(new Option("Select student", ""));
      result.students.forEach((student) => {
        cardSelect.add(
          new Option(
            `${student.student_no} · ${student.last_name}, ${student.first_name}`,
            student.student_id,
          ),
        );
      });
    }
    if (photoSelect) {
      photoSelect.replaceChildren(new Option("Select a student", ""));
      result.students.forEach((student) => {
        photoSelect.add(
          new Option(
            `${student.last_name}, ${student.first_name} — ${student.student_no}`,
            student.user_id,
          ),
        );
      });
    }
    await loadRfidCards();
  }

  async function loadRfidCards() {
    const list = byId("rfidCardList");
    if (!isAdmin || !list) return;
    try {
      const result = await api.request("/admin/cards");
      list.innerHTML = result.cards.length
        ? result.cards
            .map((card) => {
              const assignedStudent = rfidStudents.find(
                (student) =>
                  Number(student.student_id) === Number(card.student_id),
              );
              const options = [
                '<option value="">Unassign card</option>',
                ...rfidStudents.map(
                  (student) => `
              <option value="${student.student_id}" ${Number(student.student_id) === Number(card.student_id) ? "selected" : ""}>
                ${escapeHtml(`${student.student_no} · ${student.last_name}, ${student.first_name}`)}
              </option>`,
                ),
              ].join("");
              return `
            <article class="rfid-card-row" data-card-row="${card.card_id}">
              <div class="rfid-card-summary">
                <span class="reader-status-indicator${card.status === "active" ? " active" : " paused"}" aria-hidden="true"></span>
                <span class="reader-status-details">
                  <strong>${escapeHtml(card.card_uid)}</strong>
                  <small>${escapeHtml(
                    assignedStudent
                      ? `${assignedStudent.last_name}, ${assignedStudent.first_name} · ${assignedStudent.student_no}`
                      : "Unassigned",
                  )} · ${escapeHtml(card.status)}</small>
                </span>
                <button class="btn edit-rfid-card" type="button" data-card-id="${card.card_id}" aria-expanded="false">Edit</button>
              </div>
              <div class="rfid-card-editor" hidden>
                <label>Assign to student
                  <select class="rfid-card-student" aria-label="Student assigned to RFID card">${options}</select>
                </label>
                <div class="event-management-actions">
                  <button class="btn primary save-rfid-card" type="button" data-card-id="${card.card_id}">Save assignment</button>
                  <button class="btn unassign-rfid-card" type="button" data-card-id="${card.card_id}">Remove assignment</button>
                </div>
              </div>
            </article>`;
            })
            .join("")
        : '<p class="school-calendar-empty">No RFID cards have been assigned.</p>';
    } catch (error) {
      list.textContent = error.message;
    }
  }

  byId("rfidCardList")?.addEventListener("click", async (event) => {
    const editButton = event.target.closest(".edit-rfid-card");
    const saveButton = event.target.closest(".save-rfid-card");
    const unassignButton = event.target.closest(".unassign-rfid-card");
    if (editButton) {
      const editor = editButton
        .closest("[data-card-row]")
        ?.querySelector(".rfid-card-editor");
      if (editor) {
        editor.hidden = !editor.hidden;
        editButton.setAttribute("aria-expanded", String(!editor.hidden));
      }
      return;
    }
    const button = saveButton || unassignButton;
    if (!button || !isAdmin) return;
    const row = button.closest("[data-card-row]");
    const studentId = unassignButton
      ? null
      : Number(row?.querySelector(".rfid-card-student")?.value) || null;
    if (
      unassignButton &&
      !window.confirm(
        "Remove this RFID card from its assigned student? The card will be deactivated.",
      )
    )
      return;
    button.disabled = true;
    try {
      await api.request(`/admin/cards/${button.dataset.cardId}`, {
        method: "PATCH",
        body: JSON.stringify({ student_id: studentId }),
      });
      setFormMessage(
        "cardMessage",
        studentId
          ? "RFID card assignment updated."
          : "RFID card unassigned and deactivated.",
        true,
      );
      await loadRfidCards();
    } catch (error) {
      setFormMessage("cardMessage", error.message);
    } finally {
      button.disabled = false;
    }
  });

  let masterlistsForUI = [];
  async function loadMasterlists() {
    if (!isAdmin) return;
    const result = await api.request("/masterlists");
    masterlistsForUI = result.masterlists;
    for (const id of ["masterlistSelect", "teamMasterlistSelect"]) {
      const select = byId(id);
      if (!select) continue;
      const selected = select.value;
      const placeholder = "Select masterlist";
      select.replaceChildren(new Option(placeholder, ""));
      result.masterlists.forEach((item) => {
        select.add(
          new Option(
            `${item.department} · ${item.school_year} · ${item.semester} (${item.student_count})`,
            item.masterlist_id,
          ),
        );
      });
      if (
        result.masterlists.some(
          (item) => String(item.masterlist_id) === selected,
        )
      ) {
        select.value = selected;
      }
    }
  }

  async function loadTeams() {
    if (!isAdmin) return;
    const result = await api.request("/teams");
    const select = byId("teamSelect");
    if (select) {
      select.replaceChildren(new Option("Select team", ""));
      result.teams.forEach((team) =>
        select.add(
          new Option(`${team.name} · ${team.school_year}`, team.team_id),
        ),
      );
    }
  }

  async function loadTeamAdvisers() {
    if (!isAdmin) return;
    const result = await api.request("/admin/users?role=teacher");
    const select = byId("teamAdviser");
    if (!select) return;
    select.replaceChildren(new Option("Select teacher", ""));
    result.users.forEach((teacher) =>
      select.add(
        new Option(
          `${teacher.first_name} ${teacher.last_name} · ${teacher.employee_no || teacher.username}`,
          teacher.teacher_id,
        ),
      ),
    );
  }

  async function loadAdvisoryTeams() {
    if (currentUser.role !== "teacher") return;
    const select = byId("advisoryTeam");
    const rows = byId("advisoryTeamRows");
    try {
      const result = await api.request("/teams/advising");
      select.replaceChildren(new Option("Select an assigned team", ""));
      result.teams.forEach((team) =>
        select.add(
          new Option(
            `${team.name} · ${team.school_year} · ${team.member_count} members`,
            team.team_id,
          ),
        ),
      );
      if (!result.teams.length && rows) {
        rows.innerHTML =
          '<tr><td colspan="6" class="empty">No teams have been assigned to you as adviser.</td></tr>';
      }
    } catch (error) {
      if (rows)
        rows.innerHTML = `<tr><td colspan="6" class="empty">${escapeHtml(error.message)}</td></tr>`;
    }
  }

  async function loadAdvisoryAttendance() {
    const teamId = Number(byId("advisoryTeam")?.value);
    const rows = byId("advisoryTeamRows");
    if (!teamId || !rows) {
      if (rows)
        rows.innerHTML =
          '<tr><td colspan="6" class="empty">Choose a team.</td></tr>';
      return;
    }
    try {
      const result = await api.request(`/teams/${teamId}/attendance`);
      rows.innerHTML = result.attendance.length
        ? result.attendance
            .map(
              (record) => `
          <tr>
            <td>${escapeHtml(record.event_title)} · ${escapeHtml(formatDate(record.start_datetime))}</td>
            <td>${escapeHtml(record.student_name)}</td>
            <td>${escapeHtml(record.student_no)}</td>
            <td>${record.time_in ? escapeHtml(formatDate(record.time_in)) : "—"}</td>
            <td>${record.time_out ? escapeHtml(formatDate(record.time_out)) : "—"}</td>
            <td>${escapeHtml(record.status || "absent")}</td>
          </tr>`,
            )
            .join("")
        : '<tr><td colspan="6" class="empty">This team has no members or attendance events.</td></tr>';
    } catch (error) {
      rows.innerHTML = `<tr><td colspan="6" class="empty">${escapeHtml(error.message)}</td></tr>`;
    }
  }
  on("advisoryTeam", "change", () => {
    void loadAdvisoryAttendance();
  });
  on("advisoryTeamSearch", "input", () => {
    const search = byId("advisoryTeamSearch").value.trim().toLocaleLowerCase();
    byId("advisoryTeamRows")
      ?.querySelectorAll("tr")
      .forEach((row) => {
        row.hidden = Boolean(
          search && !row.textContent.toLocaleLowerCase().includes(search),
        );
      });
  });

  async function loadMasterlistCandidates() {
    const masterlistId = Number(byId("masterlistSelect")?.value);
    const container = byId("masterlistCandidates");
    if (!masterlistId || !container) {
      if (container)
        container.textContent = "Choose a masterlist to load students.";
      return;
    }
    const result = await api.request(
      `/admin/masterlists/${masterlistId}/candidates`,
    );
    renderStudentChoices(
      container,
      result.students,
      (student) => student.selected,
    );
    applyStudentChoiceFilters(
      "masterlistCandidates",
      "masterlistCandidateSearch",
      "masterlistCandidateYear",
    );
  }
  on("masterlistSelect", "change", () => {
    void loadMasterlistCandidates();
  });
  on("masterlistSelect", "change", () => {
    const masterlist = Array.from(byId("masterlistSelect").options).find(
      (option) => option.value === byId("masterlistSelect").value,
    );
    const selected = masterlistsForUI.find(
      (item) => String(item.masterlist_id) === masterlist?.value,
    );
    if (selected) {
      byId("masterlistDepartment").value = selected.department_id;
      byId("masterlistYear").value = selected.school_year;
      byId("masterlistSemester").value = selected.semester;
    }
  });

  on("saveMasterlistStudents", "click", async () => {
    const masterlistId = Number(byId("masterlistSelect")?.value);
    const studentIds = Array.from(
      byId("masterlistCandidates")?.querySelectorAll(
        ".student-choice:checked",
      ) || [],
    ).map((input) => Number(input.value));
    try {
      if (!masterlistId || !studentIds.length)
        throw new Error("Select at least one student.");
      const result = await api.request(
        `/admin/masterlists/${masterlistId}/students`,
        {
          method: "POST",
          body: JSON.stringify({ student_ids: studentIds }),
        },
      );
      setFormMessage(
        "masterlistStudentsMessage",
        `${result.added} student(s) added to the masterlist.`,
        true,
      );
      await loadMasterlists();
      await loadMasterlistCandidates();
    } catch (error) {
      setFormMessage("masterlistStudentsMessage", error.message);
    }
  });

  on("removeMasterlistStudents", "click", async () => {
    const masterlistId = Number(byId("masterlistSelect")?.value);
    const studentIds = Array.from(
      byId("masterlistCandidates")?.querySelectorAll(
        ".student-choice:checked",
      ) || [],
    ).map((input) => Number(input.value));
    try {
      if (!masterlistId || !studentIds.length)
        throw new Error("Select students to remove from the masterlist.");
      const result = await api.request(
        `/admin/masterlists/${masterlistId}/students`,
        {
          method: "DELETE",
          body: JSON.stringify({ student_ids: studentIds }),
        },
      );
      setFormMessage(
        "masterlistStudentsMessage",
        `${result.removed} student(s) removed from the masterlist.`,
        true,
      );
      await loadMasterlists();
      await loadMasterlistCandidates();
    } catch (error) {
      setFormMessage("masterlistStudentsMessage", error.message);
    }
  });

  on("updateMasterlist", "click", async () => {
    const masterlistId = Number(byId("masterlistSelect")?.value);
    try {
      if (!masterlistId) throw new Error("Select a masterlist to update.");
      await api.request(`/admin/masterlists/${masterlistId}`, {
        method: "PATCH",
        body: JSON.stringify({
          department_id: Number(byId("masterlistDepartment").value),
          school_year: byId("masterlistYear").value.trim(),
          semester: byId("masterlistSemester").value,
        }),
      });
      setFormMessage("masterlistMessage", "Masterlist updated.", true);
      await loadMasterlists();
      await loadMasterlistCandidates();
    } catch (error) {
      setFormMessage("masterlistMessage", error.message);
    }
  });

  async function loadTeamCandidates() {
    const masterlistId = Number(byId("teamMasterlistSelect")?.value);
    const container = byId("teamCandidates");
    if (!masterlistId || !container) {
      if (container)
        container.textContent = "Choose a masterlist to select students.";
      return;
    }
    const result = await api.request(`/masterlists/${masterlistId}/students`);
    renderStudentChoices(container, result.students);
    applyStudentChoiceFilters(
      "teamCandidates",
      "teamCandidateSearch",
      "teamCandidateYear",
    );
  }
  on("teamMasterlistSelect", "change", () => {
    void loadTeamCandidates();
  });

  on("assignTeamMembers", "click", async () => {
    const teamId = Number(byId("teamSelect")?.value);
    const masterlistId = Number(byId("teamMasterlistSelect")?.value);
    const studentIds = Array.from(
      byId("teamCandidates")?.querySelectorAll(".student-choice:checked") || [],
    ).map((input) => Number(input.value));
    try {
      if (!teamId || !masterlistId || !studentIds.length) {
        throw new Error("Choose a team, masterlist, and at least one student.");
      }
      const result = await api.request(`/admin/teams/${teamId}/members/bulk`, {
        method: "POST",
        body: JSON.stringify({
          masterlist_id: masterlistId,
          student_ids: studentIds,
        }),
      });
      setFormMessage(
        "teamAssignmentMessage",
        `${result.added} student(s) added to the team.`,
        true,
      );
    } catch (error) {
      setFormMessage("teamAssignmentMessage", error.message);
    }
  });

  on("assignTeamAdviser", "click", async () => {
    const teamId = Number(byId("teamSelect")?.value);
    const teacherId = Number(byId("teamAdviser")?.value);
    try {
      if (!teamId || !teacherId) throw new Error("Select a team and teacher.");
      await api.request(`/admin/teams/${teamId}/advisers`, {
        method: "POST",
        body: JSON.stringify({ teacher_id: teacherId }),
      });
      setFormMessage("teamAssignmentMessage", "Team adviser assigned.", true);
    } catch (error) {
      setFormMessage("teamAssignmentMessage", error.message);
    }
  });

  async function loadEvents() {
    if (isStudent) {
      await loadSchoolCalendar();
      return;
    }
    const eventQuery = new URLSearchParams();
    if (currentUser.role === "teacher" && currentUser.teaching_department_id) {
      eventQuery.set("department_id", currentUser.teaching_department_id);
    }
    try {
      const result = await api.request(
        `/events${eventQuery.size ? `?${eventQuery}` : ""}`,
      );
      const list = byId("eventList");
      const eventSelect = byId("attendanceEvent");
      if (eventSelect) {
        eventSelect.replaceChildren(new Option("All events", ""));
        result.events
          .filter((item) => item.requires_attendance)
          .forEach((item) => {
            eventSelect.add(
              new Option(
                `${item.title} · ${formatDate(item.start_datetime)}`,
                item.event_id,
              ),
            );
          });
      }
      if (list) {
        list.innerHTML = result.events.length
          ? result.events
              .map(
                (item) => `
            <article class="api-event-row managed-event-card">
              <strong>${escapeHtml(item.title)}</strong>
              <span>${escapeHtml(item.event_type)} · ${escapeHtml(item.department_code || "School-wide")} · ${escapeHtml(item.event_status || "pending")}
                ${
                  item.requires_attendance
                    ? item.attendance_open &&
                      !["done", "moved", "cancelled"].includes(
                        item.event_status,
                      )
                      ? '<span class="attendance-open-badge">Attendance open</span>'
                      : '<span class="attendance-closed-badge">Attendance closed</span>'
                    : ""
                }</span>
              <time>${escapeHtml(formatDate(item.start_datetime))}${item.venue ? ` · ${escapeHtml(item.venue)}` : ""}</time>
              ${
                isAdmin
                  ? `<div class="event-management-actions event-summary-actions">
                <button class="btn edit-event" type="button" aria-expanded="false">Edit event</button>
                <button class="btn open-event-attendance" data-event="${item.event_id}"
                  data-next-open="${item.attendance_open ? "false" : "true"}" type="button"
                  ${!["pending", "ongoing", null, undefined].includes(item.event_status) && !item.attendance_open ? "disabled" : ""}>
                  ${item.attendance_open ? "Close attendance" : ["pending", "ongoing", null, undefined].includes(item.event_status) ? "Open attendance now" : "Attendance closed"}
                </button>
                <button class="btn delete-event" data-event="${item.event_id}" type="button">Remove event</button>
              </div>
              <div class="event-editor" data-attendance-open="${item.attendance_open === true}" hidden>
              <label>Event status
                <select class="event-lifecycle">
                  ${["pending", "ongoing", "moved", "done", "cancelled"]
                    .map(
                      (value) =>
                        `<option value="${value}" ${value === (item.event_status || "pending") ? "selected" : ""}>${value}</option>`,
                    )
                    .join("")}
                </select>
              </label>
              <label>Title <input class="event-title" maxlength="200" value="${escapeHtml(item.title)}"></label>
              <label>Description <textarea class="event-description" maxlength="5000">${escapeHtml(item.description || "")}</textarea></label>
              <label>Type <select class="event-type">
                ${[
                  "academic",
                  "seminar",
                  "sports",
                  "intramurals",
                  "meeting",
                  "holiday",
                  "other",
                ]
                  .map(
                    (value) =>
                      `<option value="${value}" ${value === item.event_type ? "selected" : ""}>${value}</option>`,
                  )
                  .join("")}
              </select></label>
              <label>Venue <input class="event-venue" maxlength="150" value="${escapeHtml(item.venue || "")}"></label>
              <label>Status note <input class="event-status-note" maxlength="255"
                placeholder="Optional note for students" value="${escapeHtml(item.status_note || "")}"></label>
              <label>Starts <input class="event-start" type="datetime-local" value="${localDateTimeValue(item.start_datetime)}"></label>
              <label>Ends <input class="event-end" type="datetime-local" value="${localDateTimeValue(item.end_datetime)}"></label>
              <div class="event-management-actions">
                <button class="btn primary save-event-status" data-event="${item.event_id}" type="button">Save event</button>
              </div>
              </div>`
                  : ""
              }
            </article>`,
              )
              .join("")
          : "No events have been created yet.";
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const upcoming = result.events
        .filter((item) => new Date(item.end_datetime) >= today)
        .slice(0, 4);
      const dashboardEvents = byId("dashboardEvents");
      if (dashboardEvents) {
        dashboardEvents.innerHTML = upcoming.length
          ? upcoming
              .map(
                (item) => `
            <div class="api-user-row">
              <span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.event_type)} · ${escapeHtml(item.department_code || "School-wide")}</small></span>
              <span class="api-user-id">${escapeHtml(formatDate(item.start_datetime))}</span>
            </div>`,
              )
              .join("")
          : "No upcoming events.";
      }

      await loadSchoolCalendar();
      await loadRfidEventOptions();
    } catch (error) {
      if (byId("eventList")) byId("eventList").textContent = error.message;
      if (byId("dashboardEvents"))
        byId("dashboardEvents").textContent = error.message;
    }
  }

  byId("eventList")?.addEventListener("click", async (event) => {
    const editButton = event.target.closest(".edit-event");
    const saveButton = event.target.closest(".save-event-status");
    const openButton = event.target.closest(".open-event-attendance");
    const deleteButton = event.target.closest(".delete-event");
    if (
      (!editButton && !saveButton && !openButton && !deleteButton) ||
      !isAdmin
    )
      return;
    if (editButton) {
      const row = editButton.closest(".managed-event-card");
      const editor = row.querySelector(".event-editor");
      editor.hidden = !editor.hidden;
      row.classList.toggle("is-editing", !editor.hidden);
      editButton.setAttribute("aria-expanded", String(!editor.hidden));
      editButton.textContent = editor.hidden ? "Edit event" : "Close editor";
      return;
    }
    const button = saveButton || openButton || deleteButton;
    const eventId = button.dataset.event;
    const row = button.closest(".api-event-row");
    try {
      if (deleteButton) {
        if (!window.confirm("Remove this event from the school calendar?"))
          return;
        await api.request(`/events/${eventId}`, { method: "DELETE" });
        setFormMessage("eventCalendarMessage", "Event removed.", true);
        await loadEvents();
        return;
      }
      if (openButton) {
        const nextOpen = openButton.dataset.nextOpen === "true";
        await api.request(`/events/${eventId}`, {
          method: "PATCH",
          body: JSON.stringify({ attendance_open: nextOpen }),
        });
        setFormMessage(
          "eventCalendarMessage",
          nextOpen
            ? "Attendance is open for this event."
            : "Attendance is closed for new time-ins. Assigned manual time-outs remain available.",
          true,
        );
        await loadEvents();
        return;
      }
      const start = row.querySelector(".event-start").value;
      const end = row.querySelector(".event-end").value;
      if (!start || !end || new Date(end) <= new Date(start)) {
        throw new Error("Event end must be after its start.");
      }
      const status = row.querySelector(".event-lifecycle").value;
      saveButton.disabled = true;
      saveButton.classList.add("is-saving");
      saveButton.textContent = "Saving";
      await api.request(`/events/${eventId}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: row.querySelector(".event-title").value.trim(),
          description:
            row.querySelector(".event-description").value.trim() || null,
          event_type: row.querySelector(".event-type").value,
          venue: row.querySelector(".event-venue").value.trim() || null,
          event_status: status,
          attendance_open: ["done", "moved", "cancelled"].includes(status)
            ? false
            : row.querySelector(".event-editor").dataset.attendanceOpen ===
              "true",
          status_note:
            row.querySelector(".event-status-note").value.trim() || null,
          start_datetime: new Date(start).toISOString(),
          end_datetime: new Date(end).toISOString(),
        }),
      });
      setFormMessage("eventCalendarMessage", `Event saved as ${status}.`, true);
      await loadEvents();
    } catch (error) {
      setFormMessage("eventCalendarMessage", error.message);
    } finally {
      if (saveButton?.isConnected) {
        saveButton.disabled = false;
        saveButton.classList.remove("is-saving");
        saveButton.textContent = "Save event";
      }
    }
  });

  function localDateTimeValue(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const pad = (number) => String(number).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function dateTimeInputIso(value) {
    return value ? new Date(value).toISOString() : null;
  }

  function attendanceTimeValues(row, status, timeInSelector, timeOutSelector) {
    const timeIn = dateTimeInputIso(row.querySelector(timeInSelector).value);
    const timeOut = dateTimeInputIso(row.querySelector(timeOutSelector).value);
    if (timeOut && !timeIn) throw new Error("Enter time in before time out.");
    if (timeIn && timeOut && Date.parse(timeOut) < Date.parse(timeIn)) {
      throw new Error("Time out cannot be earlier than time in.");
    }
    return {
      ...(timeIn
        ? { time_in: timeIn }
        : ["present", "late"].includes(status)
          ? {}
          : { time_in: null }),
      time_out: timeOut,
    };
  }

  function eventCalendarCard(item) {
    const attendanceOpen =
      item.requires_attendance &&
      item.attendance_open === true &&
      !["done", "moved", "cancelled"].includes(item.event_status);
    const attendanceBadge = item.requires_attendance
      ? `<span class="attendance-${attendanceOpen ? "open" : "closed"}-badge">Attendance ${attendanceOpen ? "open" : "closed"}</span>`
      : "<span>School event</span>";
    return `<article class="api-event-row school-event-card">
      <div class="student-event-details">
        <strong>${escapeHtml(item.title)}</strong>
        <span>${escapeHtml(item.event_type)} · ${escapeHtml(item.event_status || "pending")} · ${attendanceBadge}</span>
        <time>${escapeHtml(formatDate(item.start_datetime))}${item.venue ? ` · ${escapeHtml(item.venue)}` : ""}</time>
        ${item.status_note ? `<span>${escapeHtml(item.status_note)}</span>` : ""}
        ${
          isAdmin && item.requires_attendance
            ? `
          <div class="event-management-actions calendar-attendance-actions">
            <button class="btn calendar-attendance-toggle" data-event="${item.event_id}"
              data-next-open="${attendanceOpen ? "false" : "true"}" type="button"
              ${!attendanceOpen && !["pending", "ongoing", null, undefined].includes(item.event_status) ? "disabled" : ""}>
              ${attendanceOpen ? "Close attendance" : "Open attendance"}
            </button>
          </div>`
            : ""
        }
      </div>
    </article>`;
  }

  let schoolCalendarEvents = [];

  function renderSchoolCalendar() {
    const eventsList = byId("schoolCalendarEvents");
    if (!eventsList) return;
    const monthValue = byId("schoolCalendarMonth")?.value;
    if (!monthValue) return;
    const upcoming = schoolCalendarEvents
      .filter(
        (item) =>
          new Date(item.end_datetime) >=
          new Date(new Date().setHours(0, 0, 0, 0)),
      )
      .sort((a, b) => new Date(a.start_datetime) - new Date(b.start_datetime));
    const monthEvents = [...schoolCalendarEvents].sort(
      (a, b) => new Date(a.start_datetime) - new Date(b.start_datetime),
    );
    eventsList.innerHTML = monthEvents.length
      ? monthEvents.map(eventCalendarCard).join("")
      : '<p class="school-calendar-empty">No school events scheduled for this month.</p>';
    if (isStudent && byId("studentUpcomingEvents")) {
      byId("studentUpcomingEvents").innerHTML = upcoming.length
        ? upcoming.map(eventCalendarCard).join("")
        : "No upcoming school events.";
    }
  }

  async function loadSchoolCalendar() {
    const monthValue = byId("schoolCalendarMonth")?.value;
    if (!monthValue) return;
    const [year, month] = monthValue.split("-").map(Number);
    const from = new Date(year, month - 1, 1);
    const to = new Date(year, month, 1);
    const query = new URLSearchParams({
      from: from.toISOString(),
      to: to.toISOString(),
    });
    if (
      !isStudent &&
      currentUser.role === "teacher" &&
      currentUser.teaching_department_id
    ) {
      query.set("department_id", currentUser.teaching_department_id);
    }
    try {
      const endpoint = isStudent ? "/students/me/events" : "/events";
      const result = await api.request(`${endpoint}?${query}`);
      schoolCalendarEvents = result.events;
      renderSchoolCalendar();
      setFormMessage("schoolCalendarMessage", "", true);
    } catch (error) {
      if (byId("schoolCalendarEvents"))
        byId("schoolCalendarEvents").textContent = error.message;
      setFormMessage("schoolCalendarMessage", error.message);
    }
  }

  on("schoolCalendarMonth", "change", () => {
    void loadSchoolCalendar();
  });

  byId("schoolCalendarEvents")?.addEventListener("click", async (event) => {
    const button = event.target.closest(".calendar-attendance-toggle");
    if (!button || !isAdmin) return;
    button.disabled = true;
    const nextOpen = button.dataset.nextOpen === "true";
    try {
      await api.request(`/events/${button.dataset.event}`, {
        method: "PATCH",
        body: JSON.stringify({ attendance_open: nextOpen }),
      });
      setFormMessage(
        "schoolCalendarMessage",
        nextOpen
          ? "Attendance is open for this event."
          : "Attendance is closed for new time-ins. Assigned manual time-outs remain available.",
        true,
      );
      await loadSchoolCalendar();
      await loadEvents();
    } catch (error) {
      setFormMessage("schoolCalendarMessage", error.message);
      button.disabled = false;
    }
  });

  if (isAdmin && byId("rfidReaderStatusList")) {
    window.setInterval(() => {
      void loadRfidReaders().catch((error) => {
        setFormMessage("rfidReaderStatusMessage", error.message);
      });
    }, 15000);
  }

  async function loadRfidEventOptions() {
    const date = byId("rfidAssignmentDate")?.value;
    if (!date || !isAdmin) return;
    const query = new URLSearchParams({ date });
    try {
      const result = await api.request(`/events?${query}`);
      const events = result.events.filter((item) => item.requires_attendance);
      const select = byId("rfidEvent");
      const selected = select?.value;
      if (select) {
        select.replaceChildren(new Option("Select event", ""));
        events.forEach((item) =>
          select.add(
            new Option(
              `${item.title} · ${new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(item.start_datetime))} · ${item.event_status || "pending"}`,
              item.event_id,
            ),
          ),
        );
        if (events.some((item) => String(item.event_id) === selected))
          select.value = selected;
      }
      await loadRfidReaders();
      await loadRfidAssignments();
    } catch (error) {
      setFormMessage("rfidEventMessage", error.message);
    }
  }

  async function loadRfidReaders() {
    const select = byId("rfidReader");
    const statusList = byId("rfidReaderStatusList");
    if (!isAdmin || (!select && !statusList)) return;
    let result;
    try {
      result = await api.request("/admin/readers");
    } catch (error) {
      if (statusList) statusList.textContent = error.message;
      throw error;
    }
    if (select) {
      const selected = select.value;
      select.replaceChildren(new Option("Select active reader", ""));
      result.readers
        .filter((reader) => reader.is_active)
        .forEach((reader) => {
          select.add(
            new Option(
              `${reader.reader_name}${reader.location ? ` · ${reader.location}` : ""}`,
              reader.reader_id,
            ),
          );
        });
      if (
        Array.from(select.options).some((option) => option.value === selected)
      )
        select.value = selected;
    }
    if (statusList) {
      statusList.innerHTML = result.readers.length
        ? result.readers
            .map(
              (reader) => `
          <div class="reader-status-row">
            <span class="reader-status-indicator${reader.is_active ? " active" : " paused"}" aria-hidden="true"></span>
            <span class="reader-status-details">
              <strong>${escapeHtml(reader.reader_name)}</strong>
              <small>
                <span class="reader-connectivity ${reader.is_online ? "online" : "offline"}">${reader.is_online ? "Online" : "Offline"}</span>
                · Reader ${reader.is_active ? "enabled" : "paused"}
                · Event ${escapeHtml(
                  reader.assigned_event_title
                    ? `${reader.assigned_event_title} (${reader.assigned_event_status || "pending"})`
                    : "not assigned for today",
                )}
                · Last seen ${reader.last_seen_at ? escapeHtml(formatDate(reader.last_seen_at)) : "never"}
              </small>
            </span>
            <button class="btn reader-status-toggle" type="button" data-reader-id="${reader.reader_id}"
              data-reader-action="toggle" data-reader-active="${reader.is_active}" aria-pressed="${reader.is_active}">
              ${reader.is_active ? "Pause check-in" : "Resume check-in"}
            </button>
            <button class="btn reader-remove-button" type="button" data-reader-id="${reader.reader_id}"
              data-reader-action="remove">Remove reader</button>
          </div>`,
            )
            .join("")
        : '<p class="school-calendar-empty">No RFID readers are registered.</p>';
    }
  }

  byId("rfidReaderStatusList")?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-reader-action]");
    if (!button || !isAdmin) return;
    button.disabled = true;
    try {
      const readerId = Number(button.dataset.readerId);
      if (button.dataset.readerAction === "remove") {
        if (
          !window.confirm(
            "Remove this RFID reader? Its event assignments will be removed; attendance history will be kept.",
          )
        ) {
          return;
        }
        await api.request(`/admin/readers/${readerId}`, { method: "DELETE" });
        setFormMessage("rfidReaderStatusMessage", "RFID reader removed.", true);
      } else {
        await api.request(`/admin/readers/${readerId}`, {
          method: "PATCH",
          body: JSON.stringify({
            is_active: button.dataset.readerActive !== "true",
          }),
        });
        setFormMessage(
          "rfidReaderStatusMessage",
          button.dataset.readerActive === "true"
            ? "Reader paused; card scans will not be recorded."
            : "Reader resumed; card scans are active.",
          true,
        );
      }
      await loadRfidReaders();
      await loadRfidAssignments();
    } catch (error) {
      setFormMessage("rfidReaderStatusMessage", error.message);
    } finally {
      button.disabled = false;
    }
  });

  async function loadRfidAssignments() {
    const date = byId("rfidAssignmentDate")?.value;
    if (!isAdmin || !date) return;
    const readerId = byId("rfidReader")?.value;
    if (!readerId) return;
    const query = new URLSearchParams({ date });
    try {
      const result = await api.request(
        `/admin/rfid/event-assignments?${query}`,
      );
      const assignment = result.assignments.find(
        (item) => String(item.reader_id) === readerId,
      );
      if (assignment) {
        if (byId("rfidEvent"))
          byId("rfidEvent").value = String(assignment.event_id);
        if (byId("rfidAttendanceMode")) {
          byId("rfidAttendanceMode").value =
            assignment.attendance_mode || "auto";
        }
      }
      setFormMessage("rfidEventMessage", "", true);
    } catch (error) {
      setFormMessage("rfidEventMessage", error.message);
    }
  }

  on("rfidAssignmentDate", "change", () => {
    void loadRfidEventOptions();
  });
  on("rfidReader", "change", () => {
    void loadRfidAssignments();
  });
  on("saveRfidEventAssignment", "click", async () => {
    await loadRfidReaders();
    const readerId = Number(byId("rfidReader")?.value);
    const eventId = Number(byId("rfidEvent")?.value);
    const attendanceDate = byId("rfidAssignmentDate")?.value;
    try {
      if (!readerId || !eventId || !attendanceDate) {
        throw new Error("Select a reader, date, and event.");
      }
      await api.request("/admin/rfid/event-assignments", {
        method: "PUT",
        body: JSON.stringify({
          reader_id: readerId,
          event_id: eventId,
          attendance_date: attendanceDate,
          attendance_mode: byId("rfidAttendanceMode").value,
        }),
      });
      setFormMessage(
        "rfidEventMessage",
        "RFID reader assigned to this event for the selected day.",
        true,
      );
    } catch (error) {
      setFormMessage("rfidEventMessage", error.message);
    }
  });

  async function loadAttendanceRows() {
    if (!isStaff || !byId("rows")) return;
    const query = new URLSearchParams();
    if (byId("search")?.value.trim())
      query.set("search", byId("search").value.trim());
    if (byId("fCourse")?.value)
      query.set("department_id", byId("fCourse").value);
    if (byId("fYear")?.value) query.set("year_level", byId("fYear").value);
    try {
      const result = await api.request(
        `/students${query.size ? `?${query}` : ""}`,
      );
      byId("rows").innerHTML = result.students.length
        ? result.students
            .map(
              (student) => `
          <tr>
            <td class="email"><span class="uicon">👤</span>${escapeHtml(`${student.first_name} ${student.last_name}`)}</td>
            <td>${escapeHtml(student.student_no)}</td>
            <td>${escapeHtml(student.year_level)}</td>
            <td>${escapeHtml(student.department_code)}</td>
          </tr>`,
            )
            .join("")
        : '<tr><td colspan="4" class="empty">No students found.</td></tr>';
    } catch (error) {
      byId("rows").innerHTML =
        `<tr><td colspan="4" class="empty">${escapeHtml(error.message)}</td></tr>`;
    }
  }

  function dateOnly(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function reportQuery(from, to, eventId = "") {
    const query = new URLSearchParams({ from, to });
    if (byId("fCourse")?.value)
      query.set("department_id", byId("fCourse").value);
    if (byId("fYear")?.value) query.set("year_level", byId("fYear").value);
    if (byId("search")?.value.trim())
      query.set("search", byId("search").value.trim());
    if (eventId) query.set("event_id", eventId);
    return query;
  }

  function localDateStartIso(date) {
    return new Date(`${date}T00:00:00+08:00`).toISOString();
  }

  let currentReportRows = [];
  function csvCell(value) {
    const raw = String(value ?? "");
    const safe = /^[\s]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
    return `"${safe.replace(/"/g, '""')}"`;
  }
  function downloadCsv(filename, headings, rows) {
    const csv = [headings, ...rows]
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.append(link);
    link.click();
    window.setTimeout(() => {
      URL.revokeObjectURL(link.href);
      link.remove();
    }, 1000);
  }

  function renderReportRows(container, attendance) {
    if (!container) return;
    container.innerHTML = attendance.length
      ? attendance
          .map(
            (record) => `
        <tr>
          <td>${escapeHtml(record.event_title)}</td>
          <td>${escapeHtml(`${record.last_name}, ${record.first_name}`)}</td>
          <td>${escapeHtml(record.student_no)}</td>
          <td>${escapeHtml(record.department_code)}</td>
          <td>${escapeHtml(record.year_level)}</td>
          <td>${escapeHtml(record.status)}</td>
          <td>${record.time_in ? escapeHtml(formatDate(record.time_in)) : "—"}</td>
          <td>${record.time_out ? escapeHtml(formatDate(record.time_out)) : "—"}</td>
        </tr>`,
          )
          .join("")
      : '<tr><td colspan="8" class="empty">No attendance matches these filters.</td></tr>';
  }

  function renderEditableAttendance(attendance) {
    const table = byId("attendanceTableRows");
    if (!table) return;
    table.innerHTML = attendance.length
      ? attendance
          .map(
            (record) => `
        <tr>
          <td>${escapeHtml(record.event_title)}</td>
          <td>${escapeHtml(`${record.last_name}, ${record.first_name}`)}</td>
          <td>${escapeHtml(record.student_no)}</td>
          <td>${escapeHtml(record.year_level)}</td>
          <td>${
            isStaff
              ? `<select class="attendance-status" aria-label="Attendance status" data-event="${record.event_id}" data-student="${record.student_id}">
                ${["present", "late", "absent", "excused"].map((status) => `<option value="${status}" ${record.status === status ? "selected" : ""}>${status}</option>`).join("")}
              </select>`
              : escapeHtml(record.status)
          }</td>
          <td>${
            isStaff
              ? `<input class="attendance-remarks" maxlength="255" aria-label="Excuse or remarks" value="${escapeHtml(record.remarks || "")}">`
              : escapeHtml(record.remarks || "—")
          }</td>
          <td>${
            isAdmin
              ? `<input class="attendance-time-in" type="datetime-local" aria-label="Time in" value="${localDateTimeValue(record.time_in)}">`
              : record.time_in
                ? escapeHtml(formatDate(record.time_in))
                : "—"
          }</td>
          <td>${
            isAdmin
              ? `<input class="attendance-time-out" type="datetime-local" aria-label="Time out" value="${localDateTimeValue(record.time_out)}">`
              : record.time_out
                ? escapeHtml(formatDate(record.time_out))
                : "—"
          }</td>
          <td>${isStaff ? `<button class="btn save-attendance" type="button" data-event="${record.event_id}" data-student="${record.student_id}">Save</button>` : "—"}</td>
        </tr>`,
          )
          .join("")
      : '<tr><td colspan="9" class="empty">No attendance found for this month.</td></tr>';
  }

  async function loadAttendanceReport() {
    const from = byId("reportFrom")?.value;
    const inclusiveTo = byId("reportTo")?.value;
    if (!isStaff || !from || !inclusiveTo) return;
    const generateButton = byId("generateReport");
    const dayAfter = new Date(localDateStartIso(inclusiveTo));
    dayAfter.setUTCDate(dayAfter.getUTCDate() + 1);
    const query = reportQuery(localDateStartIso(from), dayAfter.toISOString());
    query.set("include_current", "true");
    setText("reportRange", `${from} to ${inclusiveTo}`);
    if (generateButton) generateButton.disabled = true;
    setFormMessage("reportMessage", "Generating report…", true);
    try {
      const result = await api.request(`/attendance/report?${query}`);
      currentReportRows = result.attendance;
      setText("reportRate", `${result.summary.attendance_rate}%`);
      setText(
        "reportPresent",
        `${result.summary.present} / ${result.summary.late}`,
      );
      setText("reportAbsent", result.summary.absent);
      setText("reportExcused", result.summary.excused);
      setText("dashOverall", `${result.summary.attendance_rate}%`);
      setText("dashAbsentCount", result.summary.absent);
      setText("dashExcusedCount", result.summary.excused);
      renderReportRows(byId("reportRows"), result.attendance);
      setFormMessage("reportMessage", "", true);
    } catch (error) {
      currentReportRows = [];
      const rows = byId("reportRows");
      if (rows)
        rows.innerHTML = `<tr><td colspan="8" class="empty">${escapeHtml(error.message)}</td></tr>`;
      setFormMessage("reportMessage", error.message);
    } finally {
      if (generateButton) generateButton.disabled = false;
    }
  }

  async function loadCourseAttendance() {
    const month = byId("attendanceMonth")?.value;
    if (!isStaff || !month) return;
    const [year, monthNumber] = month.split("-").map(Number);
    const toDate = new Date(year, monthNumber, 1);
    const from = new Date(year, monthNumber - 1, 1);
    const query = reportQuery(
      from.toISOString(),
      toDate.toISOString(),
      byId("attendanceEvent")?.value || "",
    );
    query.set("include_current", "true");
    const table = byId("attendanceTableRows");
    try {
      const result = await api.request(`/attendance/report?${query}`);
      renderEditableAttendance(result.attendance);
    } catch (error) {
      if (table)
        table.innerHTML = `<tr><td colspan="9" class="empty">${escapeHtml(error.message)}</td></tr>`;
    }
  }

  byId("attendanceTableRows")?.addEventListener("click", async (event) => {
    const button = event.target.closest(".save-attendance");
    if (!button || !isStaff) return;
    const { event: eventId, student: studentId } = button.dataset;
    const row = button.closest("tr");
    const status = row.querySelector(".attendance-status")?.value;
    const remarks =
      row.querySelector(".attendance-remarks")?.value.trim() || null;
    try {
      await api.request(
        `/admin/events/${eventId}/students/${studentId}/attendance`,
        {
          method: "PUT",
          body: JSON.stringify({
            status,
            remarks,
            ...(isAdmin
              ? attendanceTimeValues(
                  row,
                  status,
                  ".attendance-time-in",
                  ".attendance-time-out",
                )
              : {}),
          }),
        },
      );
      setFormMessage("attendanceMessage", "Attendance saved.", true);
      await Promise.all([loadCourseAttendance(), loadAttendanceReport()]);
    } catch (error) {
      setFormMessage("attendanceMessage", error.message);
    }
  });

  async function loadRecentAttendance() {
    const container = byId("dashboardRecent");
    if (!isStaff || !container) return;
    try {
      const result = await api.request("/attendance/recent?limit=3");
      container.innerHTML = result.attendance.length
        ? result.attendance
            .map(
              (record) => `
          <div class="api-user-row">
            <span class="api-user-avatar">${escapeHtml(`${record.first_name[0]}${record.last_name[0]}`)}</span>
            <span><strong>${escapeHtml(record.first_name)} ${escapeHtml(record.last_name)}</strong><small>${escapeHtml(record.student_no)} · ${escapeHtml(record.event_title)}</small></span>
            <span class="api-user-id">${escapeHtml(record.time_out ? "Timed out" : "Timed in")}</span>
          </div>`,
            )
            .join("")
        : "No student check-ins yet.";
    } catch (error) {
      container.textContent = error.message;
    }
  }

  async function loadStudentDashboard() {
    if (!isStudent) return;
    const [pointsResult, eventsResult] = await Promise.allSettled([
      api.request("/students/me/points"),
      api.request("/students/me/events"),
    ]);
    const errors = [];
    if (pointsResult.status === "fulfilled") {
      setText("studentPoints", pointsResult.value.points.total_points);
      renderStudentContributionGraph(pointsResult.value.activity || []);
    } else {
      setText("studentPoints", "Unavailable");
      if (byId("studentContributionGraph")) {
        byId("studentContributionGraph").textContent =
          pointsResult.reason.message;
      }
      errors.push(`Points: ${pointsResult.reason.message}`);
    }
    setText("studentNumber", currentUser.student_no || "—");
    const list = byId("studentEventList");
    if (eventsResult.status === "fulfilled") {
      const events = eventsResult.value.events;
      list.innerHTML = events.length
        ? events.map(eventCalendarCard).join("")
        : "No school events are scheduled for your department.";
    } else {
      list.textContent = eventsResult.reason.message;
      errors.push(`Events: ${eventsResult.reason.message}`);
    }
    setText("dashboardMessage", errors.join(" · "));
  }

  function renderStudentContributionGraph(activity) {
    const graph = byId("studentContributionGraph");
    if (!graph) return;
    const daily = new Map(activity.map((item) => [item.activity_date, item]));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const firstDay = new Date(today);
    firstDay.setDate(firstDay.getDate() - 364);
    const yearCutoff = `${firstDay.getFullYear()}-${String(firstDay.getMonth() + 1).padStart(2, "0")}-${String(firstDay.getDate()).padStart(2, "0")}`;
    const totalDays = [...daily.entries()]
      .filter(([date]) => date >= yearCutoff)
      .reduce((sum, [, item]) => sum + Number(item.points || 0), 0);
    setText("studentContributionTotal", `${totalDays} points this year`);
    firstDay.setDate(firstDay.getDate() - firstDay.getDay());
    const cells = [];
    for (
      const day = new Date(firstDay);
      day <= today;
      day.setDate(day.getDate() + 1)
    ) {
      const date = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
      const record = daily.get(date);
      if (!record) {
        cells.push(
          '<span class="contribution-day level-0" aria-hidden="true"></span>',
        );
        continue;
      }
      const points = Number(record.points || 0);
      const level =
        points <= 0 ? 0 : points < 3 ? 1 : points < 6 ? 2 : points < 10 ? 3 : 4;
      const detail = Array.isArray(record.entries)
        ? record.entries
            .map((entry) => {
              const label =
                entry.event_title || entry.reason || "Attendance points";
              return `${label}: ${entry.points} point${Number(entry.points) === 1 ? "" : "s"}`;
            })
            .join("; ")
        : "";
      const dateLabel = new Intl.DateTimeFormat(undefined, {
        dateStyle: "long",
      }).format(day);
      const tooltip = `${points} attendance point${points === 1 ? "" : "s"} on ${dateLabel}${detail ? ` — ${detail}` : ""}`;
      cells.push(
        `<span class="contribution-day level-${level}" title="${escapeHtml(tooltip)}" aria-label="${escapeHtml(tooltip)}" tabindex="0"></span>`,
      );
    }
    graph.innerHTML = cells.join("");
  }

  async function loadOverview() {
    if (!isStaff) return;
    try {
      const result = await api.request("/attendance/overview");
      const cards = dashboard?.querySelectorAll(".stats .stat-card");
      if (cards?.length >= 3) {
        cards[0].querySelector(".value").textContent =
          result.overview.total_students;
        cards[0].querySelector(".label").textContent = "Total Students";
        cards[1].querySelector(".value").textContent =
          result.overview.attendance_today;
        cards[1].querySelector(".label").textContent = "Attendance Today";
        cards[2].querySelector(".value").textContent =
          result.overview.events_in_progress;
        cards[2].querySelector(".label").textContent = "Events In Progress";
        if (cards[3]) {
          cards[3].querySelector(".value").textContent =
            result.overview.late_today;
          cards[3].querySelector(".label").textContent = "Late Today";
        }
      }
      setText(
        "dashDate",
        new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
          new Date(),
        ),
      );
      setText("dashEventsInProgress", result.overview.events_in_progress);
      const statusCounts = [
        ["present", result.overview.present_today],
        ["late", result.overview.late_today],
        ["excused", result.overview.excused_today],
        ["absent", result.overview.absent_today],
      ];
      const statusTotal = statusCounts.reduce(
        (sum, [, count]) => sum + Number(count || 0),
        0,
      );
      statusCounts.forEach(([status, count]) => {
        setText(`dash${status[0].toUpperCase()}${status.slice(1)}`, count);
        const bar = dashboard?.querySelector(
          `.bar-row[data-status="${status}"] .bar-fill`,
        );
        if (bar)
          bar.style.width = `${statusTotal ? (Number(count || 0) / statusTotal) * 100 : 0}%`;
      });
      renderAttendanceHeatMap(result.heatmap || []);
      setText("dashboardMessage", "");
    } catch (error) {
      setText("dashboardMessage", `Dashboard: ${error.message}`);
    }
  }

  function renderAttendanceHeatMap(activity) {
    const container = byId("attendanceHeatMap");
    if (!container) return;
    const daily = new Map(
      activity.map((item) => [item.activity_date, Number(item.check_ins || 0)]),
    );
    const maxCount = Math.max(0, ...daily.values());
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const firstDay = new Date(today);
    firstDay.setDate(firstDay.getDate() - 29);
    firstDay.setDate(firstDay.getDate() - firstDay.getDay());
    const cells = [];
    for (
      const day = new Date(firstDay);
      day <= today;
      day.setDate(day.getDate() + 1)
    ) {
      const date = dateOnly(day);
      const checkIns = daily.get(date) || 0;
      const level =
        checkIns === 0 || maxCount === 0
          ? 0
          : Math.max(1, Math.ceil((checkIns / maxCount) * 4));
      const label = `${new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(day)}: ${checkIns} check-in${checkIns === 1 ? "" : "s"}`;
      cells.push(
        `<span class="attendance-heatmap-day heat-level-${level}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}" tabindex="0"></span>`,
      );
    }
    container.innerHTML = cells.join("");
  }

  on("resetLiveAttendance", "click", async (event) => {
    const button = event.currentTarget;
    if (
      !isAdmin ||
      !window.confirm(
        "Clear the live attendance display? This does not delete attendance records.",
      )
    )
      return;
    button.disabled = true;
    try {
      await api.request("/admin/attendance/live/reset", { method: "POST" });
      await loadRecentAttendance();
      setFormMessage(
        "dashboardMessage",
        "Live attendance display reset. Attendance records were kept.",
        true,
      );
    } catch (error) {
      setFormMessage("dashboardMessage", error.message);
    } finally {
      button.disabled = false;
    }
  });

  const currentMonth = new Date();
  const monthValue = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, "0")}`;
  const monthStart = new Date(
    currentMonth.getFullYear(),
    currentMonth.getMonth(),
    1,
  );
  if (byId("attendanceMonth")) byId("attendanceMonth").value = monthValue;
  if (byId("schoolCalendarMonth"))
    byId("schoolCalendarMonth").value = monthValue;
  if (byId("rfidAssignmentDate"))
    byId("rfidAssignmentDate").value = dateOnly(currentMonth);
  if (byId("reportFrom")) byId("reportFrom").value = dateOnly(monthStart);
  if (byId("reportTo")) byId("reportTo").value = dateOnly(currentMonth);

  await Promise.allSettled([
    loadDepartments(),
    loadEvents(),
    loadStudentDirectory(),
    loadRfidEventOptions(),
    loadStudentDashboard(),
    loadOverview(),
    loadStudentChoices(),
    loadMasterlists(),
    loadTeams(),
    loadTeamAdvisers(),
    loadAdvisoryTeams(),
  ]);
  await Promise.allSettled([
    loadAdminUsers(),
    loadAttendanceRows(),
    loadRecentAttendance(),
    loadAttendanceReport(),
    loadCourseAttendance(),
  ]);
  on("search", "input", () => {
    if (isStaff) {
      void loadAttendanceRows();
      void loadAttendanceReport();
      void loadCourseAttendance();
    }
  });
  on("fCourse", "change", () => {
    void loadAttendanceRows();
    void loadAttendanceReport();
    void loadCourseAttendance();
  });
  on("fYear", "change", () => {
    void loadAttendanceRows();
    void loadAttendanceReport();
    void loadCourseAttendance();
  });
  on("generateReport", "click", () => {
    void loadAttendanceReport();
  });
  on("exportReport", "click", () => {
    if (!currentReportRows.length) {
      setFormMessage(
        "reportMessage",
        "Generate a report with matching records before downloading.",
      );
      return;
    }
    const rows = currentReportRows.map((record) => [
      record.event_title,
      record.student_no,
      record.first_name,
      record.last_name,
      record.department_code,
      record.year_level,
      record.status,
      record.time_in ? formatDate(record.time_in) : "",
      record.time_out ? formatDate(record.time_out) : "",
      record.remarks || "",
    ]);
    downloadCsv(
      "attendka-attendance-report.csv",
      [
        "Event",
        "Student ID",
        "First name",
        "Last name",
        "Department",
        "Year level",
        "Status",
        "Time in",
        "Time out",
        "Remarks",
      ],
      rows,
    );
    setFormMessage("reportMessage", "Excel-compatible CSV downloaded.", true);
  });
  on("reportFrom", "change", () => {
    void loadAttendanceReport();
  });
  on("reportTo", "change", () => {
    void loadAttendanceReport();
  });
  on("attendanceMonth", "change", () => {
    void loadCourseAttendance();
  });
  on("attendanceEvent", "change", () => {
    void loadCourseAttendance();
  });
  if (isStaff)
    window.setInterval(() => {
      void loadRecentAttendance();
    }, 5000);
});
