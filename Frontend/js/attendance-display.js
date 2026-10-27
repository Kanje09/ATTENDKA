(() => {
  const slides = document.getElementById("checkinSlides");
  const status = document.getElementById("connectionStatus");
  const statusWrap = status.parentElement;
  const dots = document.getElementById("carouselDots");
  let lastFingerprint = "";

  function formatTime(value) {
    if (!value) return "—";
    return new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
  }

  function initials(record) {
    return (
      `${record.first_name?.[0] || ""}${record.last_name?.[0] || ""}`.toUpperCase() ||
      "S"
    );
  }

  function render(records) {
    const fingerprint = records
      .map(
        (record) =>
          `${record.attendance_id}:${record.time_in}:${record.time_out || ""}:${record.status}`,
      )
      .join("|");
    if (fingerprint === lastFingerprint) return;
    lastFingerprint = fingerprint;

    if (!records.length) {
      slides.innerHTML =
        '<article class="checkin-empty">No student check-ins yet. New attendance will appear here.</article>';
      dots.replaceChildren();
      return;
    }

    const cards = records.map((record) => {
      const name = `${record.first_name} ${record.last_name}`.trim();
      const card = document.createElement("article");
      card.className = "checkin-card";
      const image = document.createElement("img");
      image.className = "checkin-photo";
      image.src = record.photo || "";
      image.alt = `Photo of ${name}`;
      image.addEventListener(
        "error",
        () => {
          const fallback = document.createElement("div");
          fallback.className = "checkin-initials";
          fallback.textContent = initials(record);
          image.replaceWith(fallback);
        },
        { once: true },
      );
      if (!image.src || image.getAttribute("src") === "") {
        const fallback = document.createElement("div");
        fallback.className = "checkin-initials";
        fallback.textContent = initials(record);
        image.replaceWith(fallback);
      }

      const info = document.createElement("div");
      info.className = "checkin-info";
      const title = document.createElement("h2");
      title.className = "checkin-name";
      title.textContent = name;
      const meta = document.createElement("div");
      meta.className = "checkin-meta";
      const student = document.createElement("span");
      student.textContent = `${record.student_no} · ${record.department_code}`;
      const result = document.createElement("span");
      result.className = "checkin-status";
      result.textContent = record.time_out
        ? "Timed out"
        : record.status === "late"
          ? "Late"
          : "Present";
      meta.append(student, result);

      const times = document.createElement("div");
      times.className = "checkin-times";
      for (const [label, value] of [
        ["TIME IN", formatTime(record.time_in)],
        ["TIME OUT", formatTime(record.time_out)],
      ]) {
        const item = document.createElement("div");
        const caption = document.createElement("span");
        caption.textContent = label;
        item.append(caption, ` ${value}`);
        times.append(item);
      }

      const event = document.createElement("div");
      event.className = "checkin-meta";
      const eventName = document.createElement("span");
      eventName.textContent = record.event_title;
      event.append(eventName);
      info.append(title, meta, times, event);
      card.append(image, info);
      return card;
    });
    slides.replaceChildren(...cards);
    dots.replaceChildren(
      ...records.map((_, index) => {
        const dot = document.createElement("i");
        if (index === 0) dot.className = "active";
        return dot;
      }),
    );
  }

  async function refresh() {
    try {
      const response = await window.attendkaApi.request(
        "/attendance/recent?limit=5",
      );
      status.textContent = "Live · refreshes every 3 seconds";
      statusWrap.classList.add("connected");
      statusWrap.classList.remove("offline");
      render(response.attendance || []);
    } catch (error) {
      status.textContent = error.message.includes("sign in")
        ? "Sign in required"
        : "API unavailable";
      statusWrap.classList.add("offline");
      statusWrap.classList.remove("connected");
      if (!localStorage.getItem("ptci_access_token")) {
        slides.innerHTML =
          '<article class="checkin-empty">Sign in as an administrator or teacher, then open this display from the dashboard.</article>';
      }
    }
  }

  function tick() {
    document.getElementById("displayClock").textContent =
      new Intl.DateTimeFormat(undefined, {
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
      }).format(new Date());
  }

  document
    .getElementById("fullscreenButton")
    .addEventListener("click", async () => {
      try {
        if (!document.fullscreenElement)
          await document.documentElement.requestFullscreen();
        else await document.exitFullscreen();
      } catch {
        status.textContent = "Full screen is unavailable in this browser";
      }
    });

  tick();
  void refresh();
  window.setInterval(tick, 1000);
  window.setInterval(() => {
    void refresh();
  }, 3000);
})();
