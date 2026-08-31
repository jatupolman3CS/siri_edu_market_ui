import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { installFavicon } from './app/core/brand-assets';

// Every image this app shows comes from R2 through the API — the tab icon included.
installFavicon(document);

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
