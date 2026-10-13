/** A deadline-based timer stays accurate when the browser throttles background tabs. */
export class PresentationTimer {
  constructor(durationSeconds = 300, now = () => performance.now()) {
    this.durationMs = durationSeconds * 1000;
    this.now = now;
    this.remainingMs = this.durationMs;
    this.deadline = null;
  }

  update() {
    if (this.deadline !== null) {
      this.remainingMs = Math.max(0, this.deadline - this.now());
      if (this.remainingMs === 0) this.deadline = null;
    }
  }

  get remainingSeconds() {
    this.update();
    return Math.ceil(this.remainingMs / 1000);
  }

  get running() {
    this.update();
    return this.deadline !== null;
  }

  start() {
    this.update();
    if (this.remainingMs > 0 && this.deadline === null) this.deadline = this.now() + this.remainingMs;
  }

  pause() {
    this.update();
    this.deadline = null;
  }

  reset() {
    this.deadline = null;
    this.remainingMs = this.durationMs;
  }
}

export function formatTime(seconds) {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
