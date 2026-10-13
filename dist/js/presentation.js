import { PresentationTimer, formatTime } from './timer.js';

/** Presentation UI is optional; the interview components remain shared. */
export class PresentationPractice {
  constructor(createElement, notify) {
    this.element = createElement;
    this.notify = notify;
    this.timer = null;
    this.interval = null;
    this.status = 'ready';
    this.$ = selector => document.querySelector(selector);
    this.$('#timer-start').addEventListener('click', () => this.start());
    this.$('#timer-pause').addEventListener('click', () => this.pause());
    this.$('#timer-reset').addEventListener('click', () => {
      this.timer?.reset();
      this.status = 'ready';
      this.update();
    });
    this.$('#script-toggle').addEventListener('click', () => {
      const script = this.$('#presentation-script');
      script.hidden = !script.hidden;
      this.$('#script-hidden-notice').hidden = !script.hidden;
      this.$('#script-toggle').textContent = script.hidden ? '原稿を表示する' : '原稿を隠す';
      this.$('#script-toggle').setAttribute('aria-expanded', String(!script.hidden));
    });
    document.addEventListener('visibilitychange', () => this.update());
  }

  reset() {
    clearInterval(this.interval);
    this.interval = null;
    this.timer = null;
    this.status = 'ready';
    this.$('#presentation-script').replaceChildren();
    this.$('#presentation-content').hidden = true;
    this.$('#presentation-error').hidden = true;
  }

  render(data) {
    this.timer = new PresentationTimer(data.durationSeconds);
    this.status = 'ready';
    this.$('#presentation-title').textContent = data.title;
    this.$('#presentation-sample').hidden = data.isDummy !== true;
    this.$('#timer-duration').textContent = `制限時間 ${formatTime(data.durationSeconds)}`;
    const script = this.$('#presentation-script');
    script.replaceChildren();
    script.hidden = false;
    this.$('#script-hidden-notice').hidden = true;
    this.$('#script-toggle').textContent = '原稿を隠す';
    this.$('#script-toggle').setAttribute('aria-expanded', 'true');
    data.sections.forEach(section => {
      const item = this.element('section', 'script-section');
      item.append(this.element('h4', '', section.heading));
      if (section.timeGuide) item.append(this.element('p', 'script-time', section.timeGuide));
      item.append(this.element('p', 'script-body', section.body));
      script.append(item);
    });
    for (const [selector, values] of [['#presentation-points', data.points], ['#presentation-cautions', data.cautions]]) {
      this.$(selector).replaceChildren(...values.map(value => this.element('li', '', value)));
    }
    this.$('#presentation-content').hidden = false;
    this.update();
  }

  start() {
    if (!this.timer || this.timer.remainingSeconds === 0) return;
    this.timer.start();
    this.status = 'running';
    clearInterval(this.interval);
    this.interval = setInterval(() => this.update(), 250);
    this.update();
  }

  pause() {
    if (!this.timer?.running) return;
    this.timer.pause();
    this.status = 'paused';
    this.update();
  }

  update() {
    if (!this.timer) return;
    const seconds = this.timer.remainingSeconds;
    const running = this.timer.running;
    if (seconds === 0 && this.status !== 'finished') {
      this.status = 'finished';
      this.notify('制限時間になりました。練習おつかれさまでした。');
    }
    if (!running) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.$('#timer-display').textContent = formatTime(seconds);
    this.$('#timer-display').classList.toggle('ending', seconds <= 60);
    const text = { ready: '開始ボタンで練習をはじめよう', running: '練習中です', paused: '一時停止中です', finished: '時間になりました。リセットして再練習できます。' }[this.status];
    if (this.$('#timer-status').textContent !== text) this.$('#timer-status').textContent = text;
    this.$('#timer-start').textContent = this.status === 'paused' ? '再開' : '開始';
    this.$('#timer-start').disabled = running || seconds === 0;
    this.$('#timer-pause').disabled = !running;
  }
}
