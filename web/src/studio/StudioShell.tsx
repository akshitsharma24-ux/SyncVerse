import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useActiveFile, usePresence, useSession } from '../session';
import { useRoom } from '../room';
import { EditorPanel } from '../editor';
import { RunPanel } from '../console';
import { AIPanel } from '../ai';
import { QualityPanel } from '../quality';
import { DebugPanel } from '../debug';
import { ProgressPanel } from '../progress';
import { WhiteboardPanel } from '../whiteboard';
import { VideoDock } from '../video';
import { SamplesMenu } from '../demo';
import { PanelBoundary } from '../shell/PanelBoundary';
import { PresenceToasts } from '../shell/PresenceToasts';
import { RoomDrawer } from '../shell/RoomDrawer';
import { StatusChip } from '../shell/StatusChip';
import { Icon } from '../shell/icons';
import { Brand } from './Brand';
import { clamp, ResizeHandle, useMedia, useSize, useStudioLayout } from './layout';
import './workspace.css';

const TOOLS = [
  { id: 'ai', label: 'Understand', icon: 'sparkle', el: <AIPanel/> },
  { id: 'video', label: 'Together', icon: 'video', el: <VideoDock/> },
  { id: 'board', label: 'Whiteboard', icon: 'board', el: <WhiteboardPanel/> },
  { id: 'quality', label: 'Code quality', icon: 'checklist', el: <QualityPanel/> },
  { id: 'debug', label: 'Debug', icon: 'bug', el: <DebugPanel/> },
  { id: 'progress', label: 'Your progress', icon: 'chart', el: <ProgressPanel/> },
] as const;
type ToolId = typeof TOOLS[number]['id'];

export function StudioShell() {
  const { session, leave } = useSession();
  const { room, isOwner } = useRoom();
  const people = usePresence();
  const file = useActiveFile();
  const [tool, setTool] = useState<ToolId>('ai');
  const [focused, setFocused] = useState(false);
  const [layout, updateLayout] = useStudioLayout();
  const [resizing, setResizing] = useState<'x' | 'y' | null>(null);
  const [drawer, setDrawer] = useState<'people' | 'history' | 'settings' | null>(null);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sidebarButton = useRef<HTMLButtonElement>(null);
  const learningButton = useRef<HTMLButtonElement>(null);
  const consoleButton = useRef<HTMLButtonElement>(null);
  const mobile = useMedia('(max-width: 760px)');
  const overlaySidebar = useMedia('(max-width: 1100px)');
  const [panelsRef, panelsSize] = useSize();
  const [codingRef, codingSize] = useSize();
  const sidebarVisible = layout.sidebar && !focused;
  const consoleVisible = layout.console && !focused;
  const learningVisible = layout.learning && !focused;
  const consoleMax = mobile ? 600 : Math.max(120, codingSize.height - 270);
  const consoleHeight = clamp(layout.consoleHeight, 120, consoleMax);
  const learningMax = Math.max(260, Math.min(720, panelsSize.width - 420));
  const learningWidth = clamp(layout.learningWidth, 260, learningMax);
  const learningHeight = clamp(layout.learningHeight, 300, 800);
  const sidebarWidth = clamp(layout.sidebarWidth, 180, 280);
  const active = TOOLS.find(t => t.id === tool)!;

  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current); }, []);
  // The whiteboard needs room: the first time it is opened the learning panel grows to a comfortable width (the person can resize it).
  useEffect(() => { if (tool === 'board' && !mobile && layout.learningWidth < 440) updateLayout({ learningWidth: 440 }); }, [tool, mobile]);
  useEffect(() => {
    const onEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape' && overlaySidebar && sidebarVisible && !drawer) {
        updateLayout({ sidebar: false }); sidebarButton.current?.focus();
      }
    };
    document.addEventListener('keydown', onEscape);
    return () => document.removeEventListener('keydown', onEscape);
  }, [overlaySidebar, sidebarVisible, drawer]);

  if (!session) return null;

  async function invite() {
    const link = `${location.origin}/?room=${encodeURIComponent(session!.roomCode)}`;
    try {
      await navigator.clipboard.writeText(link); setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch { window.prompt('Copy your room link', link); }
  }

  function chooseTool(id: ToolId) {
    setTool(id); setFocused(false);
    updateLayout({ learning: true, ...(overlaySidebar ? { sidebar: false } : {}) });
    if (overlaySidebar) learningButton.current?.focus();
    if (mobile) requestAnimationFrame(() => document.getElementById('learning-tools')?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' }));
  }

  function keyNav(event: KeyboardEvent) {
    const index = TOOLS.findIndex(t => t.id === tool);
    const next = event.key === 'ArrowDown' ? (index + 1) % TOOLS.length : event.key === 'ArrowUp' ? (index + TOOLS.length - 1) % TOOLS.length : event.key === 'Home' ? 0 : event.key === 'End' ? TOOLS.length - 1 : -1;
    if (next < 0) return;
    event.preventDefault(); setTool(TOOLS[next].id); setFocused(false); updateLayout({ learning: true });
    document.getElementById(`tool-${TOOLS[next].id}`)?.focus();
  }

  const consoleResize = <ResizeHandle axis="y" label="Resize console" controls="console-panel" value={consoleHeight} min={120} max={consoleMax} direction={mobile ? 1 : -1} onChange={consoleHeight => updateLayout({ consoleHeight })} onDrag={setResizing}/>;
  const learningResize = <ResizeHandle axis={mobile ? 'y' : 'x'} label="Resize learning panel" controls="learning-tools" value={mobile ? learningHeight : learningWidth} min={mobile ? 300 : 260} max={mobile ? 800 : learningMax} direction={mobile ? 1 : -1} onChange={value => updateLayout(mobile ? { learningHeight: value } : { learningWidth: value })} onDrag={setResizing}/>;

  return <div className={`studio-workspace ${focused ? 'focus-mode' : ''}`} data-resizing={resizing ?? undefined}>
    <a className="skip-link" href="#editor-region">Skip to editor</a>
    <header className="studio-topbar" data-testid="topbar">
      <button ref={sidebarButton} className="btn btn-outline btn-sm sidebar-toggle" aria-label={sidebarVisible ? 'Hide sidebar' : 'Show sidebar'} aria-expanded={sidebarVisible} aria-controls="workspace-sidebar" onClick={() => { updateLayout({ sidebar: !sidebarVisible }); setFocused(false); }}><Icon name="sidebar" size={17}/><span>Sidebar</span></button>
      <Brand/>
      <span className="topbar-slash">/</span>
      <div className="workspace-crumb"><strong data-testid="room-code">{room?.name ?? session.roomCode}</strong></div>
      <div className="workspace-top-actions">
        <div className="workspace-service-status"><StatusChip/></div>
        <div className="workspace-avatars" data-testid="topbar-people">{people.slice(0, 4).map(p => <span key={p.userId} data-topbar-presence={p.name} title={`${p.name} · ${p.role}`} style={{ borderColor: p.color }}>{p.name.slice(0, 2).toUpperCase()}</span>)}</div>
        <button className="btn btn-outline btn-sm room-button" onClick={() => setDrawer('people')} data-testid="room-open"><Icon name="users" size={14}/><span>Room</span></button>
        <button className="btn studio-primary btn-sm" data-testid="copy-invite" onClick={() => void invite()}><Icon name={copied ? 'check' : 'plus'} size={14}/>{copied ? 'Link copied' : 'Invite a friend'}</button>
        <button className="btn btn-outline btn-sm workspace-leave" onClick={() => { history.replaceState(null, '', location.pathname); leave(); }}><Icon name="arrow" size={14}/><span>Leave room</span></button>
      </div>
    </header>
    <PresenceToasts/>
    <div className="workspace-layout">
      {overlaySidebar && sidebarVisible && <button className="sidebar-scrim" aria-label="Close sidebar" onClick={() => { updateLayout({ sidebar: false }); sidebarButton.current?.focus(); }}/>}
      <aside id="workspace-sidebar" className="workspace-sidebar" aria-label="Workspace navigation" hidden={!sidebarVisible} style={{ width: sidebarWidth }}>
        <div className="sidebar-heading"><span>Workspace</span><button className="panel-close" aria-label="Close sidebar" onClick={() => { updateLayout({ sidebar: false }); sidebarButton.current?.focus(); }}><Icon name="x" size={15}/></button></div>
        <div className="sidebar-room"><span className="room-monogram">{session.roomCode.slice(0, 1).toUpperCase()}</span><div><strong>Your learning space</strong><small>{isOwner ? 'Owner' : session.role} · {people.length} online</small></div></div>
        <button className="sidebar-editor" onClick={() => { if (overlaySidebar) updateLayout({ sidebar: false }); document.querySelector<HTMLElement>('.monaco-editor textarea')?.focus(); }}><Icon name="terminal" size={16}/> Code editor <span>↗</span></button>
        <span className="sidebar-label tools-label">LEARNING TOOLS</span>
        <div className="workspace-tools" role="tablist" aria-label="Workspace tools" aria-orientation="vertical" onKeyDown={keyNav}>{TOOLS.map(t => <button id={`tool-${t.id}`} key={t.id} role="tab" aria-selected={tool === t.id} aria-controls={`panel-${t.id}`} tabIndex={tool === t.id ? 0 : -1} className={tool === t.id && learningVisible ? 'selected' : ''} onClick={() => chooseTool(t.id)}><Icon name={t.icon} size={17}/><span>{t.label}</span>{tool === t.id && learningVisible && <i/>}</button>)}</div>
        <div className="sidebar-bottom">
          <button onClick={() => setDrawer('history')} data-testid="history-open"><Icon name="history" size={16}/> Version history</button>
          <button onClick={() => setDrawer('settings')}><Icon name="checklist" size={16}/> Room settings</button>
          <div className="workspace-user"><span>{session.name.slice(0, 2).toUpperCase()}</span><div><strong>{session.name}</strong><small data-testid="my-role">{isOwner ? 'owner · ' : ''}{session.role === 'student' ? 'Here to learn' : session.role}</small></div><span className="live-dot"/></div>
        </div>
      </aside>
      {sidebarVisible && !overlaySidebar && <ResizeHandle axis="x" label="Resize sidebar" controls="workspace-sidebar" value={sidebarWidth} min={180} max={280} onChange={sidebarWidth => updateLayout({ sidebarWidth })} onDrag={setResizing}/>}
      <main className="workspace-main" aria-label="Coding workspace">
        <div className="workspace-panels" ref={panelsRef}>
          <div className="workspace-coding" ref={codingRef}>
            <section className="workspace-editor panel" aria-label="Shared editor" id="editor-region" tabIndex={-1}>
              <div className="studio-editor-title">
                <h1><Icon name="terminal" size={16}/><span>Shared editor</span></h1>
                <div className="editor-toolbar">
                  <button ref={consoleButton} className="btn btn-outline btn-sm panel-toggle" aria-expanded={consoleVisible} aria-controls="console-panel" aria-label={consoleVisible ? 'Hide console' : 'Show console'} onClick={() => { updateLayout({ console: !consoleVisible }); setFocused(false); }}><Icon name="terminal" size={14}/><span>Console</span></button>
                  <button ref={learningButton} className="btn btn-outline btn-sm panel-toggle" aria-expanded={learningVisible} aria-controls="learning-tools" aria-label={learningVisible ? 'Hide learning panel' : 'Show learning panel'} onClick={() => { updateLayout({ learning: !learningVisible }); setFocused(false); }}><Icon name="panel" size={14}/><span>Learning tools</span></button>
                  <span className="toolbar-divider"/>
                  <PanelBoundary name="samples" compact><SamplesMenu/></PanelBoundary>
                  <button className="btn btn-outline btn-sm focus-toggle" aria-pressed={focused} onClick={() => setFocused(!focused)}><Icon name="eye" size={14}/><span>{focused ? 'Exit focus' : 'Focus mode'}</span></button>
                </div>
              </div>
              <PanelBoundary name="editor"><EditorPanel/></PanelBoundary>
            </section>
            {consoleVisible && !mobile && consoleResize}
            <section id="console-panel" className="workspace-console panel" aria-label="Console" hidden={!consoleVisible} style={{ height: consoleHeight }}>
              <div className="studio-panel-heading"><span><Icon name="terminal" size={14}/> Console / output</span><div><span className="console-privacy"><Icon name="lock" size={11}/> Your runs are private</span><button className="panel-close" aria-label="Close console" onClick={() => { updateLayout({ console: false }); consoleButton.current?.focus(); }}><Icon name="minus" size={15}/></button></div></div>
              <div className="workspace-console-body"><PanelBoundary name="console"><RunPanel/></PanelBoundary></div>
            </section>
            {consoleVisible && mobile && consoleResize}
          </div>
          {learningVisible && !mobile && learningResize}
          <aside id="learning-tools" className="workspace-dock panel" aria-label="Learning tools" hidden={!learningVisible} style={mobile ? { height: learningHeight } : { width: learningWidth }}>
            <div className="dock-heading"><Icon name={active.icon} size={17}/><select aria-label="Learning tool" value={tool} onChange={event => setTool(event.target.value as ToolId)}>{TOOLS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select><button className="panel-close" aria-label="Close learning panel" onClick={() => { updateLayout({ learning: false }); learningButton.current?.focus(); }}><Icon name="x" size={15}/></button></div>
            <div className={`dock-content ${tool === 'video' ? 'dock-video' : ''}`}>{TOOLS.map(t => <div key={t.id} id={`panel-${t.id}`} role="tabpanel" aria-label={t.label} hidden={tool !== t.id}><PanelBoundary name={t.id}>{t.el}</PanelBoundary></div>)}</div>
          </aside>
          {learningVisible && mobile && learningResize}
        </div>
      </main>
    </div>
    <footer className="workspace-status"><span><Icon name="lock" size={11}/> Shared code. Private discoveries.</span><span>{file?.language ?? 'Python'}<i/>UTF-8<i/><kbd>Ctrl</kbd> + <kbd>Enter</kbd> to run</span></footer>
    {drawer && <RoomDrawer initialTab={drawer} onClose={() => setDrawer(null)}/>}
  </div>;
}
