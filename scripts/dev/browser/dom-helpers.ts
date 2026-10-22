// Obsidian's DOM helpers (createEl / createDiv / empty / addClass ...) on HTMLElement.prototype, as the plugin's views expect them. Same code as the top of entry.ts, kept apart so a second page
// entry (entry-panel.ts) can use it without importing the Beat Box tab's mount code.
const proto: any = HTMLElement.prototype;
const apply = (el: HTMLElement, o: any) => {
  if (!o) return el;
  if (o.cls) String(o.cls).split(/\s+/).filter(Boolean).forEach((c) => el.classList.add(c));
  if (o.text != null) el.textContent = o.text;
  if (o.attr) Object.keys(o.attr).forEach((k) => el.setAttribute(k, String(o.attr[k])));
  return el;
};
proto.createEl = function (tag: string, o?: any) { const e = document.createElement(tag); apply(e, o); this.appendChild(e); return e; };
proto.createDiv = function (o?: any) { return this.createEl('div', o); };
proto.createSpan = function (o?: any) { return this.createEl('span', o); };
proto.empty = function () { this.innerHTML = ''; };
proto.addClass = function (c: string) { this.classList.add(c); };
proto.removeClass = function (c: string) { this.classList.remove(c); };
proto.toggleClass = function (c: string, on: boolean) { this.classList.toggle(c, !!on); };
proto.setText = function (t: string) { this.textContent = t; };
proto.isShown = function () { return !!(this.offsetWidth || this.offsetHeight || this.getClientRects().length); };
export {};
