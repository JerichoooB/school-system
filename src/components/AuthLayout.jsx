import { ArrowUpRight, BookOpen, Check, GraduationCap, Moon, Sun } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTheme } from '../context/useTheme';
import '../styles/auth.css';

function Brand({ light = false }) {
  return <Link className={`auth-brand${light ? ' auth-brand-light' : ''}`} to="/" aria-label="School Hub home">
    <span className="auth-brand-mark"><GraduationCap size={23} strokeWidth={1.7} /></span>
    <span>School Hub<span className="auth-brand-caption">YOUR STUDENT WORKSPACE</span></span>
  </Link>;
}

export default function AuthLayout({ eyebrow, title, description, children, footer }) {
  const { darkMode, toggleTheme } = useTheme();
  return <div className="auth-layout">
    <aside className="auth-story">
      <Brand light />
      <div className="auth-story-content">
        <span className="auth-story-eyebrow"><span /> A LITTLE MORE CONNECTED</span>
        <p className="auth-story-title">Your next chapter<br />starts here<span>.</span></p>
        <p className="auth-story-description">A place for your classes, your progress,<br />and everything you’re working toward.</p>
        <div className="auth-illustration" aria-hidden="true">
          <div className="auth-orbit auth-orbit-one" /><div className="auth-orbit auth-orbit-two" />
          <div className="auth-study-card">
            <div className="auth-study-top"><span className="auth-study-icon"><BookOpen size={22} /></span><span className="auth-study-tag">YOUR SPACE TO GROW</span></div>
            <div className="auth-study-heading">A clear view.<br />A fresh start.</div>
            <div className="auth-study-lines"><span /><span /><span /></div>
            <div className="auth-study-bottom"><span className="auth-study-check"><Check size={16} /></span> One step closer, every day.</div>
          </div>
          <div className="auth-note"><span>✦</span><div>Small steps.<strong>Big possibilities.</strong></div></div>
          <div className="auth-spark auth-spark-one">✦</div><div className="auth-spark auth-spark-two">✧</div>
        </div>
      </div>
      <div className="auth-story-footer"><span>Learn. Connect. Move forward.</span><span>© {new Date().getFullYear()} School Hub</span></div>
    </aside>
    <div className="auth-main">
      <header className="auth-header">
        <div className="auth-mobile-brand"><Brand /></div>
        <Link to="/support" className="auth-help">Need a hand? <span>Get support <ArrowUpRight size={14} /></span></Link>
        <button type="button" className="auth-theme-toggle" onClick={toggleTheme} aria-label="Toggle theme" aria-pressed={darkMode} title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}>
          {darkMode ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </header>
      <main className="auth-main-content">
        <section className="auth-card">
          <p className="auth-eyebrow">{eyebrow || 'WELCOME TO SCHOOL HUB'}</p>
          <h1>{title}</h1>
          <p className="auth-description">{description}</p>
          {children}
          {footer && <div className="auth-card-footer">{footer}</div>}
        </section>
      </main>
      <footer className="auth-bottom"><span>Made for your school day.</span><Link to="/support">Help &amp; support <ArrowUpRight size={12} /></Link></footer>
    </div>
  </div>;
}
