import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyImageBindings, uploadComfyUIImage } from '@/services/comfyui/api';
import type { ComfyUIImageBindingTarget, ComfyUIWorkflow } from '@/services/comfyui/types';
import * as avatarService from '@/services/tavern-helper/avatar';
import { createMockFetch } from '../../../helpers/fetch-mocks';

describe('comfyui image upload and dynamic bindings', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('uploads image successfully to /upload/image', async () => {
    const mockFetch = createMockFetch(() => ({
      json: { name: 'uploaded_test.png', subfolder: '', type: 'input' },
    }));
    vi.stubGlobal('fetch', mockFetch);

    const blob = new Blob(['fake image data'], { type: 'image/png' });
    const result = await uploadComfyUIImage('http://127.0.0.1:8188', blob, {
      filename: 'custom.png',
      overwrite: true,
    });

    expect(result.name).toBe('uploaded_test.png');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:8188/upload/image');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBeInstanceOf(FormData);
  });

  it('throws error when upload response is invalid', async () => {
    vi.stubGlobal('fetch', createMockFetch(() => ({ status: 500, ok: false })));
    const blob = new Blob(['data'], { type: 'image/png' });
    await expect(uploadComfyUIImage('http://127.0.0.1:8188', blob)).rejects.toThrow(/请求失败 \(500\)/);
  });

  it('applies character avatar bindings dynamically to workflow', async () => {
    const fakeFile = new File(['fake avatar'], 'avatar.png', { type: 'image/png' });
    const readSpy = vi.spyOn(avatarService, 'readAvatarFile').mockResolvedValue(fakeFile);

    const mockFetch = createMockFetch(() => ({
      json: { name: 'avatar_result.png' },
    }));
    vi.stubGlobal('fetch', mockFetch);

    const workflow: ComfyUIWorkflow = {
      '1': {
        class_type: 'LoadImage',
        inputs: { image: 'old.png' },
      },
    };

    const bindings: ComfyUIImageBindingTarget[] = [
      { nodeId: '1', inputName: 'image', source: 'character-avatar' },
    ];

    await applyImageBindings('http://127.0.0.1:8188', workflow, bindings);

    expect(readSpy).toHaveBeenCalledWith('character-avatar');
    expect(workflow['1'].inputs.image).toBe('avatar_result.png');
  });

  it('includes subfolder when ComfyUI upload returns one', async () => {
    const fakeFile = new File(['fake avatar'], 'avatar.png', { type: 'image/png' });
    vi.spyOn(avatarService, 'readAvatarFile').mockResolvedValue(fakeFile);
    vi.stubGlobal(
      'fetch',
      createMockFetch(() => ({ json: { name: 'avatar_result.png', subfolder: 'cosmos', type: 'input' } })),
    );

    const workflow: ComfyUIWorkflow = {
      '1': { class_type: 'LoadImage', inputs: { image: 'old.png' } },
    };
    const bindings: ComfyUIImageBindingTarget[] = [
      { nodeId: '1', inputName: 'image', source: 'user-avatar' },
    ];

    await applyImageBindings('http://127.0.0.1:8188', workflow, bindings);

    expect(workflow['1'].inputs.image).toBe('cosmos/avatar_result.png');
  });

  it('rejects promptly when signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const readSpy = vi.spyOn(avatarService, 'readAvatarFile').mockResolvedValue(
      new File(['x'], 'avatar.png', { type: 'image/png' }),
    );
    const fetchMock = createMockFetch(() => ({ json: { name: 'never.png' } }));
    vi.stubGlobal('fetch', fetchMock);

    const workflow: ComfyUIWorkflow = { '1': { class_type: 'LoadImage', inputs: { image: 'old.png' } } };
    const bindings: ComfyUIImageBindingTarget[] = [
      { nodeId: '1', inputName: 'image', source: 'character-avatar' },
    ];

    await expect(
      applyImageBindings('http://127.0.0.1:8188', workflow, bindings, controller.signal),
    ).rejects.toThrow();
    // 取消信号已 abort，跳过 readAvatarFile 直接抛出
    expect(readSpy).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
