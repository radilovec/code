import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'projects',
    pathMatch: 'full',
  },
  // Lazy-loaded фичи — добавим в T4.x и T7.x
];
