import { TestBed } from '@angular/core/testing';
import { LocalStorageService } from './localStorage.service';

describe('LocalStorageService', () => {
  let service: LocalStorageService;
  const storage = { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() };

  beforeEach(() => {
    storage.getItem.mockReset().mockReturnValue(null);
    storage.setItem.mockReset();
    storage.removeItem.mockReset();
    vi.stubGlobal('localStorage', storage);
    service = TestBed.inject(LocalStorageService);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('reads saved JSON without pretending to validate its shape', () => {
    storage.getItem.mockReturnValue('{"searchValue":"motor","page":2}');
    expect(service.get('filters')).toEqual({ searchValue: 'motor', page: 2 });
  });

  it('returns null for missing or corrupted data', () => {
    expect(service.get('filters')).toBeNull();
    storage.getItem.mockReturnValue('{broken');
    expect(service.get('filters')).toBeNull();
  });

  it('writes and removes only the requested key', () => {
    expect(service.set('filters', { page: 2 })).toBe(true);
    expect(storage.setItem).toHaveBeenCalledExactlyOnceWith('filters', '{"page":2}');
    expect(service.remove('filters')).toBe(true);
    expect(storage.removeItem).toHaveBeenCalledExactlyOnceWith('filters');
  });

  it('does not throw if access or quota prevents persistence', () => {
    const fail = () => {
      throw new Error('Storage unavailable');
    };
    storage.getItem.mockImplementation(fail);
    storage.setItem.mockImplementation(fail);
    storage.removeItem.mockImplementation(fail);
    expect(service.get('filters')).toBeNull();
    expect(service.set('filters', { page: 2 })).toBe(false);
    expect(service.remove('filters')).toBe(false);
  });

  it('does not store values that cannot be serialized as JSON', () => {
    expect(service.set('filters', undefined)).toBe(false);
    const circular: { self?: unknown } = {};
    circular.self = circular;
    expect(service.set('filters', circular)).toBe(false);
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});
