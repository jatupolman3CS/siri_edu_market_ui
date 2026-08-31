import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { installFavicon } from './app/core/brand-assets';

// Repoints the tab icon at the R2 copy. `index.html` ships a local one too, so the tab is never
// briefly blank while the bundle loads — that file is the pre-boot fallback, R2 is the source.
installFavicon(document);

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
