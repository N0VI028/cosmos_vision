import { describe, expect, it } from 'vitest';
import {
  ensureFloorTailHost,
  ensureFloorTailSlotContainer,
  findFloorTailHost,
} from '@/services/inline-image/floor-tail-host';

describe('floor-tail-host', () => {
  it('creates and finds floor tail host container in message', () => {
    document.body.innerHTML = `
      <div id="chat">
        <div class="mes" mesid="42">
          <div class="mes_text">消息正文内容</div>
        </div>
      </div>
    `;

    const host = ensureFloorTailHost(42, 0);
    expect(host.classList.contains('cv-floor-tail')).toBe(true);
    expect(host.getAttribute('data-cv-mesid')).toBe('42');
    expect(host.getAttribute('data-cv-swipe')).toBe('0');
    expect(host.getAttribute('data-cv-route')).toBe('frontend');

    const found = findFloorTailHost(42, 0);
    expect(found).toBe(host);
  });

  it('creates dedicated slot sub-container inside floor tail host', () => {
    document.body.innerHTML = `
      <div id="chat">
        <div class="mes" mesid="42">
          <div class="mes_text">消息正文内容</div>
        </div>
      </div>
    `;

    const slotContainer = ensureFloorTailSlotContainer(42, 0, 'slot-1234');
    expect(slotContainer.classList.contains('cv-floor-tail-slot')).toBe(true);
    expect(slotContainer.getAttribute('data-cv-slot')).toBe('slot-1234');
    expect(slotContainer.parentElement?.classList.contains('cv-floor-tail')).toBe(true);

    const reused = ensureFloorTailSlotContainer(42, 0, 'slot-1234');
    expect(reused).toBe(slotContainer);
  });

  it('places floor tail host after the LAST TH-render in multi-iframe floors when no target specified', () => {
    document.body.innerHTML = `
      <div id="chat">
        <div class="mes" mesid="2">
          <div class="mes_text">
            <div class="TH-render" id="th-0"><iframe id="frame-0"></iframe></div>
            <div class="TH-render" id="th-1"><iframe id="frame-1"></iframe></div>
          </div>
        </div>
      </div>
    `;

    const host = ensureFloorTailHost(2, 0);
    const th1 = document.getElementById('th-1')!;
    expect(th1.nextElementSibling).toBe(host);
  });

  it('places floor tail host precisely after the targeted iframe TH-render container (Scheme A)', () => {
    document.body.innerHTML = `
      <div id="chat">
        <div class="mes" mesid="2">
          <div class="mes_text">
            <div class="TH-render" id="th-0"><iframe id="frame-0"></iframe></div>
            <div class="TH-render" id="th-1"><iframe id="frame-1"></iframe></div>
            <div class="TH-render" id="th-2"><iframe id="frame-2"></iframe></div>
          </div>
        </div>
      </div>
    `;

    const frame1 = document.getElementById('frame-1')!;
    const host = ensureFloorTailHost(2, 0, frame1);
    const th1 = document.getElementById('th-1')!;
    expect(th1.nextElementSibling).toBe(host);
    expect(host.nextElementSibling?.id).toBe('th-2');
  });
});
