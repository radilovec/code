import { Injectable } from '@angular/core';
import { Observable, ReplaySubject } from 'rxjs';

declare const monaco: typeof import('monaco-editor');

interface MonacoWindow extends Window {
  require: {
    config: (cfg: Record<string, unknown>) => void;
    (deps: string[], callback: () => void): void;
  };
}

@Injectable({ providedIn: 'root' })
export class MonacoLoaderService {
  private readonly loaded$ = new ReplaySubject<typeof monaco>(1);
  private loading = false;

  load(): Observable<typeof monaco> {
    if (!this.loading) {
      this.loading = true;
      this.loadScript();
    }
    return this.loaded$.asObservable();
  }

  private loadScript(): void {
    const script = document.createElement('script');
    script.src = '/monaco-editor/min/vs/loader.js';
    script.onload = () => {
      const win = window as unknown as MonacoWindow;
      win.require.config({ paths: { vs: '/monaco-editor/min/vs' } });
      win.require(['vs/editor/editor.main'], () => {
        this.loaded$.next(monaco);
        this.loaded$.complete();
      });
    };
    document.head.appendChild(script);
  }
}
