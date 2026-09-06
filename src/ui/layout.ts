/** Zonas compartidas de interfaz: los paneles estrechos conservan el lienzo y los controles. */
export function installGameLayout(): void {
  if (document.getElementById('city-bill-layout')) return;
  const style = document.createElement('style');
  style.id = 'city-bill-layout';
  style.textContent = `
@media(max-width:900px){
  .cb-debug-hud{bottom:270px!important}
  .cb-bar{left:12px;right:12px;bottom:10px;flex-direction:row;flex-wrap:wrap;align-items:center;gap:5px;max-height:80px}
  .cb-bar .cb-help-toggle{align-self:auto;padding:7px 8px;letter-spacing:0}
  .cb-bar .cb-overlay-label{order:5}.cb-bar .cb-slot{order:6}
  .cb-bar .cb-help{position:absolute;bottom:calc(100% + 8px);left:0;max-width:calc(100vw - 48px);max-height:45vh;overflow:auto;z-index:30}
  .cb-bar .cb-key,.cb-bar .cb-what{white-space:normal}
  .cb-toolbar{bottom:100px;width:calc(100vw - 24px);min-width:0}
  .cb-toolbar-row{display:grid;grid-template-columns:repeat(6,minmax(0,1fr))}
  .cb-tool-button{min-width:0;padding:8px 3px;font-size:11px}
  .cb-toolbar-footer{max-width:100%;box-sizing:border-box;text-align:center;line-height:1.4}
  .cb-toolbar-menu{max-height:calc(100vh - 290px)}
  .cb-build-menu{max-height:none}.cb-build-cards{max-height:calc(100vh - 460px);min-height:100px}
  .cb-budget-root{top:76px}.cb-budget-panel{max-height:calc(100vh - 220px)}
  .cb-city-secondary{top:calc(100% + 46px)}
  .cb-district-panel{top:114px;max-height:calc(100vh - 320px);overflow:auto}
  .cb-dev-panel{top:76px!important;max-height:calc(100vh - 280px);overflow:auto!important}
  .cb-inspector{bottom:280px!important;max-height:calc(100vh - 390px);overflow:auto;pointer-events:auto!important;max-width:calc(100vw - 48px);white-space:pre-wrap!important}
  .cb-chronicle{top:114px!important;max-height:calc(100vh - 320px)!important;overflow:auto!important;pointer-events:auto!important}
  .ob-tip{bottom:245px}
}
@media(max-width:560px){
  .cb-toolbar-row{grid-template-columns:repeat(3,minmax(0,1fr))}
  .cb-brand{font-size:11px;padding:4px 7px}.cb-pill{min-width:25px;padding:0 6px}
  .cb-build-cards{max-height:calc(100vh - 500px)}
}
@media(max-width:430px){
  .cb-budget-root{top:112px}.cb-dev-panel{top:112px!important}
  .cb-district-panel,.cb-chronicle{top:150px!important}
}
`;
  document.head.appendChild(style);
}
