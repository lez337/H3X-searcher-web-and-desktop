import {Download} from 'lucide-react';
import {releaseRepository,version} from '../../package.json';

export default function InstallApp(){
  if(window.h3xDesktop)return null;
  const url=`https://github.com/${releaseRepository}/releases/download/v${version}/H3X-Searcher-Setup-${version}-x64.exe`;
  return <section className="panel web-connected-app"><h2>Windows application</h2><div className="workspace-action"><div><h3>H3X for Windows</h3><p>Download and run the setup .exe to install H3X on Windows (64-bit).</p></div><a className="report-open-link primary" href={url}><Download size={15}/>Download setup.exe</a></div></section>;
}
