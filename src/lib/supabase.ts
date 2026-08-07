import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ MISSING ENV VARS: VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY not set!');
}

console.log('✅ Supabase init:', supabaseUrl?.substring(0, 30));

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    flowType: 'pkce',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  },
});

// ─── Admin config ───────────────────────────────────────────────────────────
export const ADMIN_PHONE_CLEAN = '255655299602';
export const ADMIN_GOOGLE_EMAIL = 'railaty68@gmail.com';

export function isAdminPhone(phone: string): boolean {
  const c = phone.replace(/\D/g, '');
  return c === '255655299602' || c === '0655299602' || c === '655299602';
}

export function isAdminEmail(email: string): boolean {
  return !!email && email.toLowerCase().trim() === ADMIN_GOOGLE_EMAIL.toLowerCase();
}

// ─── Phone → email helpers ───────────────────────────────────────────────────
export function normalizePhone(phone: string): string {
  const c = phone.replace(/\D/g, '');
  if (c.startsWith('255') && c.length === 12) return c;
  if (c.startsWith('0') && c.length === 10) return '255' + c.slice(1);
  if ((c.startsWith('6') || c.startsWith('7')) && c.length === 9) return '255' + c;
  return c;
}

export function phoneToEmail(phone: string): string {
  return `${normalizePhone(phone)}@slr.app`;
}

export function getAllPhoneEmails(phone: string): string[] {
  const c = phone.replace(/\D/g, '');
  const emails = new Set<string>();
  const normalized = normalizePhone(phone);
  emails.add(`${normalized}@slr.app`);
  if (c.startsWith('0') && c.length === 10) {
    emails.add(`255${c.slice(1)}@slr.app`);
    emails.add(`${c}@slr.app`);
  }
  if (c.startsWith('255') && c.length === 12) {
    emails.add(`0${c.slice(3)}@slr.app`);
    emails.add(`${c}@slr.app`);
  }
  if ((c.startsWith('6') || c.startsWith('7')) && c.length === 9) {
    emails.add(`255${c}@slr.app`);
    emails.add(`0${c}@slr.app`);
  }
  emails.add(`${c}@slr.app`);
  return Array.from(emails).filter(Boolean);
}

// ─── Global upload session tracker ─────────────────────────────────────────
export const globalUploadTracker = {
  speedMap: new Map<string, { lastBytes: number; lastTime: number; speed: number }>(),
  getSpeed(sessionId: string): number { return this.speedMap.get(sessionId)?.speed || 0; },

  // ── Upload Queue ──────────────────────────────────────────────────────────
  MAX_CONCURRENT: 2,
  queue: [] as Array<{
    sessionId: string;
    bucket: string;
    path: string;
    file: File;
    onProgress: (pct: number) => void;
    contentType: string;
    resolve: (url: string) => void;
    reject: (err: Error) => void;
  }>,
  activeCount: 0,

  // Get queue position (1-based) or 0 if currently uploading
  getQueuePosition(sessionId: string): number {
    const idx = this.queue.findIndex(q => q.sessionId === sessionId);
    return idx >= 0 ? idx + 1 : 0;
  },

  // Called after an upload finishes (success or fail) to drain the queue
  _drainQueue() {
    this.activeCount = Math.max(0, this.activeCount - 1);
    this._startNext();
  },

  _startNext() {
    while (this.activeCount < this.MAX_CONCURRENT && this.queue.length > 0) {
      const item = this.queue.shift()!;
      this.activeCount++;
      this.notify();
      const s = this.sessions.get(item.sessionId);
      if (!s || s.cancelled) { this._drainQueue(); continue; }
      s.paused = false;
      if (s.resumeInfo) {
        s.resumeInfo = { bucket: item.bucket, path: item.path, file: item.file, onProgress: item.onProgress, contentType: item.contentType };
      }
      _xhrUpload(item.bucket, item.path, item.file, item.onProgress, item.sessionId, item.contentType)
        .then(url => { item.resolve(url); this._drainQueue(); })
        .catch(err => { item.reject(err); this._drainQueue(); });
    }
  },

  // Enqueue an upload — returns a promise that resolves with the public URL
  enqueue(bucket: string, path: string, file: File, onProgress: (pct: number) => void, sessionId: string, contentType: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const s = this.sessions.get(sessionId);
      if (s) s.resumeInfo = { bucket, path, file, onProgress, contentType };
      if (this.activeCount < this.MAX_CONCURRENT) {
        this.activeCount++;
        this.notify();
        _xhrUpload(bucket, path, file, onProgress, sessionId, contentType)
          .then(url => { resolve(url); this._drainQueue(); })
          .catch(err => { reject(err); this._drainQueue(); });
      } else {
        this.queue.push({ sessionId, bucket, path, file, onProgress, contentType, resolve, reject });
        this.notify();
      }
    });
  },

  sessions: new Map<string, {
    sessionId: string;
    fileName: string;
    fileSize: number;
    progress: number;
    section: string;
    userId: string;
    username: string;
    contentType: string;
    startedAt: number;
    cancelled: boolean;
    paused: boolean;
    abortController: AbortController | null;
    // Stored so we can restart after resume
    resumeInfo: { bucket: string; path: string; file: File; onProgress: (pct: number) => void; contentType: string } | null;
  }>(),

  // Active XHR references — used to abort on pause
  xhrMap: new Map<string, XMLHttpRequest>(),

  listeners: new Set<() => void>(),
  notify() { this.listeners.forEach(l => { try { l(); } catch {} }); },

  register(sessionId: string, info: { fileName: string; fileSize: number; section: string; userId: string; username: string; contentType: string }) {
    this.sessions.set(sessionId, {
      sessionId, ...info,
      progress: 0, startedAt: Date.now(),
      cancelled: false, paused: false,
      abortController: new AbortController(),
      resumeInfo: null,
    });
    this.notify();
    supabase.from('upload_sessions').insert({
      id: sessionId, user_id: info.userId || null, username: info.username || null,
      file_name: info.fileName, file_size: info.fileSize, section: info.section,
      content_type: info.contentType, status: 'uploading', progress: 0,
    }).then(() => {}).catch(() => {});
  },

  updateProgress(sessionId: string, pct: number, uploadedBytes?: number) {
    const s = this.sessions.get(sessionId);
    if (s) {
      s.progress = pct;
      const now = Date.now();
      const loaded = uploadedBytes ?? 0;
      const prev = this.speedMap.get(sessionId);
      if (prev && now - prev.lastTime >= 500) {
        const deltaBytes = loaded - prev.lastBytes;
        const deltaSec = (now - prev.lastTime) / 1000;
        const speed = deltaSec > 0 ? deltaBytes / deltaSec : 0;
        this.speedMap.set(sessionId, { lastBytes: loaded, lastTime: now, speed });
      } else if (!prev) {
        this.speedMap.set(sessionId, { lastBytes: loaded, lastTime: now, speed: 0 });
      }
      this.notify();
    }
    supabase.from('upload_sessions').update({
      progress: pct, uploaded_bytes: uploadedBytes ?? 0,
      status: pct >= 100 ? 'completed' : 'uploading',
      completed_at: pct >= 100 ? new Date().toISOString() : null,
    }).eq('id', sessionId).then(() => {}).catch(() => {});
  },

  complete(sessionId: string, mediaUrl?: string, contentPostId?: string) {
    const s = this.sessions.get(sessionId);
    if (s) { s.progress = 100; this.notify(); }
    supabase.from('upload_sessions').update({
      progress: 100, status: 'completed', media_url: mediaUrl || null,
      content_post_id: contentPostId || null, completed_at: new Date().toISOString(),
    }).eq('id', sessionId).then(() => {}).catch(() => {});
    setTimeout(() => { this.sessions.delete(sessionId); this.xhrMap.delete(sessionId); this.notify(); }, 2000);
  },

  cancel(sessionId: string) {
    const s = this.sessions.get(sessionId);
    if (s) {
      s.cancelled = true;
      s.abortController?.abort();
      this.xhrMap.get(sessionId)?.abort();
      this.sessions.delete(sessionId);
      this.speedMap.delete(sessionId);
      this.xhrMap.delete(sessionId);
      // Also remove from queue if waiting
      this.queue = this.queue.filter(q => q.sessionId !== sessionId);
      this.notify();
    }
    supabase.from('upload_sessions').update({ status: 'cancelled', completed_at: new Date().toISOString() })
      .eq('id', sessionId).then(() => {}).catch(() => {});
  },

  pause(sessionId: string) {
    const s = this.sessions.get(sessionId);
    if (!s || s.paused || s.cancelled) return;
    s.paused = true;
    // Abort live XHR — this stops the transfer mid-way
    this.xhrMap.get(sessionId)?.abort();
    this.xhrMap.delete(sessionId);
    supabase.from('upload_sessions').update({ status: 'paused' }).eq('id', sessionId).catch(() => {});
    this.notify();
  },

  async resume(sessionId: string): Promise<void> {
    const s = this.sessions.get(sessionId);
    if (!s || !s.paused || !s.resumeInfo) return;
    s.paused = false;
    s.abortController = new AbortController();
    // Reset progress to 0 since we restart from beginning
    s.progress = 0;
    supabase.from('upload_sessions').update({ status: 'uploading', progress: 0 }).eq('id', sessionId).catch(() => {});
    this.notify();
    const { bucket, path, file, onProgress, contentType } = s.resumeInfo;
    try {
      await _xhrUpload(bucket, path, file, onProgress, sessionId, contentType);
    } catch {
      const still = this.sessions.get(sessionId);
      if (still && !still.paused) this.fail(sessionId);
    }
  },

  fail(sessionId: string) {
    this.sessions.delete(sessionId);
    this.speedMap.delete(sessionId);
    this.xhrMap.delete(sessionId);
    this.notify();
    supabase.from('upload_sessions').update({ status: 'failed', completed_at: new Date().toISOString() })
      .eq('id', sessionId).then(() => {}).catch(() => {});
  },

  startBackgroundSync() {
    setInterval(() => {
      if (this.sessions.size === 0) return;
      this.sessions.forEach((s, sessionId) => {
        if (s.cancelled || s.paused) return;
        supabase.from('upload_sessions').update({
          progress: s.progress,
          status: s.progress >= 100 ? 'completed' : 'uploading',
          uploaded_bytes: Math.round(s.fileSize * s.progress / 100),
        }).eq('id', sessionId).catch(() => {});
      });
    }, 5000);
  }
};

globalUploadTracker.startBackgroundSync();

// ─── Internal XHR upload with tracker integration ────────────────────────────
async function _xhrUpload(
  bucket: string,
  path: string,
  file: File,
  onProgress: (pct: number) => void,
  sessionId: string,
  contentType: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const storageUrl = `${supabaseUrl}/storage/v1/object/${bucket}/${path}`;
    const xhr = new XMLHttpRequest();
    xhr.open('POST', storageUrl);
    xhr.setRequestHeader('Authorization', `Bearer ${supabaseAnonKey}`);
    xhr.setRequestHeader('apikey', supabaseAnonKey);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.setRequestHeader('x-upsert', 'true');
    xhr.setRequestHeader('Cache-Control', '3600');

    // Register XHR for pause control
    globalUploadTracker.xhrMap.set(sessionId, xhr);

    xhr.upload.onprogress = (e) => {
      const s = globalUploadTracker.sessions.get(sessionId);
      if (s?.paused || s?.cancelled) return;
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100);
        onProgress(pct);
        globalUploadTracker.updateProgress(sessionId, pct, e.loaded);
      }
    };

    xhr.onload = () => {
      globalUploadTracker.xhrMap.delete(sessionId);
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        globalUploadTracker.updateProgress(sessionId, 100, file.size);
        const publicUrl = `${supabaseUrl}/storage/v1/object/public/${bucket}/${path}`;
        globalUploadTracker.complete(sessionId, publicUrl);
        resolve(publicUrl);
      } else {
        let errMsg = `HTTP ${xhr.status}`;
        try { const j = JSON.parse(xhr.responseText); errMsg = j.message || j.error || errMsg; } catch {}
        console.error('XHR upload failed:', errMsg);
        // Fallback to SDK
        supabase.storage.from(bucket).upload(path, file, { upsert: true, contentType }).then(({ error }) => {
          if (error) { globalUploadTracker.fail(sessionId); reject(new Error(error.message)); }
          else {
            const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path);
            onProgress(100);
            globalUploadTracker.complete(sessionId, urlData.publicUrl);
            resolve(urlData.publicUrl);
          }
        });
      }
    };

    xhr.onerror = () => {
      globalUploadTracker.xhrMap.delete(sessionId);
      supabase.storage.from(bucket).upload(path, file, { upsert: true, contentType }).then(({ error }) => {
        if (error) { globalUploadTracker.fail(sessionId); reject(new Error(error.message)); }
        else {
          const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path);
          onProgress(100);
          globalUploadTracker.complete(sessionId, urlData.publicUrl);
          resolve(urlData.publicUrl);
        }
      });
    };

    xhr.onabort = () => {
      globalUploadTracker.xhrMap.delete(sessionId);
      const s = globalUploadTracker.sessions.get(sessionId);
      if (s?.paused) reject(new Error('Upload paused'));
      else reject(new Error('Upload cancelled'));
    };

    xhr.send(file);
  });
}

// ─── File upload (public API) ─────────────────────────────────────────────────
export async function uploadFile(
  bucket: string,
  path: string,
  file: File,
  onProgress?: (pct: number) => void,
  sessionId?: string
): Promise<string> {
  // Determine proper content type
  let contentType = file.type;
  if (!contentType || contentType === 'application/octet-stream') {
    const ext = path.split('.').pop()?.toLowerCase() || '';
    const mimeMap: Record<string, string> = {
      mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', avi: 'video/avi',
      mkv: 'video/x-matroska', '3gp': 'video/3gpp', m4v: 'video/x-m4v',
      jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
      gif: 'image/gif', heic: 'image/heic', heif: 'image/heif',
      mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', aac: 'audio/aac', flac: 'audio/flac',
    };
    contentType = mimeMap[ext] || 'application/octet-stream';
  }

  if (onProgress) {
    // If sessionId provided, store resumeInfo so pause/resume works, and enqueue
    if (sessionId) {
      const s = globalUploadTracker.sessions.get(sessionId);
      if (s) {
        s.resumeInfo = { bucket, path, file, onProgress, contentType };
      }
      return globalUploadTracker.enqueue(bucket, path, file, onProgress, sessionId, contentType);
    }

    // No sessionId — plain XHR with progress
    return new Promise((resolve, reject) => {
      const storageUrl = `${supabaseUrl}/storage/v1/object/${bucket}/${path}`;
      const xhr = new XMLHttpRequest();
      xhr.open('POST', storageUrl);
      xhr.setRequestHeader('Authorization', `Bearer ${supabaseAnonKey}`);
      xhr.setRequestHeader('apikey', supabaseAnonKey);
      xhr.setRequestHeader('Content-Type', contentType);
      xhr.setRequestHeader('x-upsert', 'true');
      xhr.setRequestHeader('Cache-Control', '3600');

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress(100);
          resolve(`${supabaseUrl}/storage/v1/object/public/${bucket}/${path}`);
        } else {
          supabase.storage.from(bucket).upload(path, file, { upsert: true, contentType }).then(({ error }) => {
            if (error) reject(new Error(error.message));
            else {
              const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path);
              onProgress(100);
              resolve(urlData.publicUrl);
            }
          });
        }
      };
      xhr.onerror = () => {
        supabase.storage.from(bucket).upload(path, file, { upsert: true, contentType }).then(({ error }) => {
          if (error) reject(new Error(error.message));
          else {
            const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path);
            onProgress(100);
            resolve(urlData.publicUrl);
          }
        });
      };
      xhr.onabort = () => reject(new Error('Upload cancelled'));
      xhr.send(file);
    });
  }

  // SDK upload (no progress)
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true, contentType });
  if (error) {
    console.error('SDK upload failed:', error.message, 'bucket:', bucket, 'path:', path, 'type:', contentType);
    throw new Error(error.message);
  }
  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path);
  return urlData.publicUrl;
}
