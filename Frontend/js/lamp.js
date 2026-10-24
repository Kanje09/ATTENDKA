

function toggleLamp() {
  const lamp = document.getElementById('lamp');
  const turnOn = !document.body.classList.contains('lamp-on');

  document.body.classList.toggle('lamp-on', turnOn);
  document.body.classList.toggle('lamp-off', !turnOn);

  if (lamp) {
    lamp.setAttribute('aria-pressed', String(turnOn));
    lamp.classList.remove('pulled');
    void lamp.offsetWidth;               // restart animation
    lamp.classList.add('pulled');
    setTimeout(() => lamp.classList.remove('pulled'), 700);
  }

  if (turnOn) {
    setTimeout(() => {
      const email = document.getElementById('email');
      if (email) email.focus({ preventScroll: true });
    }, 650);
  }
}

document.addEventListener('click', function (e) {
  if (e.target.closest('#lamp')) toggleLamp();
});