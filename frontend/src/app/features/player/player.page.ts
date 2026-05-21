import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-player-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<h1>Плеер</h1>`,
})
export class PlayerPageComponent {}
