import { Component, type ReactNode } from 'react';
import { t } from '../lib/i18n';

/** A failed lazy workspace must not unmount navigation or healthy analyses. */
export class AnalysisBoundary extends Component<{children:ReactNode},{failed:boolean}> {
  state={failed:false};
  static getDerivedStateFromError() { return {failed:true}; }
  render() {
    if(!this.state.failed)return this.props.children;
    return <section className="research-empty analysis-recovery" role="alert">
      <h2>{t('This analysis could not load')}</h2>
      <p>{t('The connection may have failed, or a new app version may have been published. Other workspaces remain available.')}</p>
      <button onClick={()=>{
        // Pages/CDN caches may still serve the old HTML after its chunks vanish.
        // Preserve the investigation hash while requesting a fresh entry page.
        const url=new URL(window.location.href);
        url.searchParams.set('app_refresh',String(Date.now()));
        window.location.replace(url.href);
      }}>{t('Reload the latest app')}</button>
      <p>{t('Your investigation link and saved preferences remain. Reloading resets unsaved scenario inputs.')}</p>
    </section>;
  }
}
