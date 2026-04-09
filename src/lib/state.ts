// Domain durum takibi
// Not: Netlify'da kalıcı storage için KV veya external DB kullanılabilir
// Şimdilik basit bir in-memory + environment variable yaklaşımı

export interface DomainState {
  domain: string;
  lastStatus: 'blocked' | 'open' | 'unknown';
  lastChecked: string;
  lastNotified?: string;
  consecutiveBlocked: number;
  consecutiveOpen: number;
}

// In-memory state (her deploy'da sıfırlanır, ama Netlify Blobs ile persist edilebilir)
const domainStates: Map<string, DomainState> = new Map();

export function getState(domain: string): DomainState | undefined {
  return domainStates.get(domain.toLowerCase());
}

export function setState(domain: string, state: DomainState): void {
  domainStates.set(domain.toLowerCase(), state);
}

export function getAllStates(): DomainState[] {
  return Array.from(domainStates.values());
}

// Durum değişikliği kontrolü - bildirim gerekiyor mu?
export function shouldNotify(
  domain: string,
  currentlyBlocked: boolean
): { notify: boolean; type: 'blocked' | 'unblocked' | 'none' } {
  const state = getState(domain);

  if (!state) {
    // İlk kontrol - sadece engelliyse bildir
    if (currentlyBlocked) {
      return { notify: true, type: 'blocked' };
    }
    return { notify: false, type: 'none' };
  }

  const wasBlocked = state.lastStatus === 'blocked';

  // Durum değişti mi?
  if (currentlyBlocked && !wasBlocked) {
    // Yeni engel geldi
    return { notify: true, type: 'blocked' };
  } else if (!currentlyBlocked && wasBlocked) {
    // Engel kalktı
    return { notify: true, type: 'unblocked' };
  }

  return { notify: false, type: 'none' };
}

export function updateState(
  domain: string,
  blocked: boolean
): void {
  const existing = getState(domain);
  const now = new Date().toISOString();

  if (existing) {
    setState(domain, {
      ...existing,
      lastStatus: blocked ? 'blocked' : 'open',
      lastChecked: now,
      consecutiveBlocked: blocked ? existing.consecutiveBlocked + 1 : 0,
      consecutiveOpen: blocked ? 0 : existing.consecutiveOpen + 1,
    });
  } else {
    setState(domain, {
      domain: domain.toLowerCase(),
      lastStatus: blocked ? 'blocked' : 'open',
      lastChecked: now,
      consecutiveBlocked: blocked ? 1 : 0,
      consecutiveOpen: blocked ? 0 : 1,
    });
  }
}
