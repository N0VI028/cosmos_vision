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
});
