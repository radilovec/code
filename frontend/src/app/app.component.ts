import { ChangeDetectionStrategy, Component } from '@angular/core';
import { AppShellComponent } from './core/shell/app-shell.component';

@Component({
  selector: 'app-root',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppShellComponent],
  template: `<app-shell />`,
})
export class AppComponent {}
