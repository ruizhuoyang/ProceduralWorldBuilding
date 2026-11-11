import { useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import HomeHeroCanvas from './HomeHeroCanvas'
import './HomePage.css'

type Props = {
  onEnter: () => void
}

const ABOUT = [
  'Rock holds traces of events that happened long before us. Digital records can be erased in seconds, yet a backup can keep a birthday, an old address, or a date you once marked long after you’ve forgotten why it mattered.',
  'In Data Fossil, the digits of a number you choose shape a stone. You can leave a short note about what it means to you, then send the stone into orbit. As fossils collide and form planets, they leave imprints you can discover on the surface.',
  'If a record outlasts the memory that gave it meaning, what has been preserved?',
]

export default function HomePage({ onEnter }: Props) {
  const { ready, user, busy, error, signInWithGoogle, signOutUser } = useAuth()
  const [aboutOpen, setAboutOpen] = useState(false)

  useEffect(() => {
    if (!aboutOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAboutOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [aboutOpen])

  return (
    <div className="home">
      <aside className="home__copy" aria-label="Data Fossil introduction">
        <h1 className="home__title">Data Fossil</h1>
        <p className="home__lede">
          Turn a number into a fossil and discover the traces it leaves on a planet.
        </p>

        <div className="home__actions">
          <button type="button" className="home__enter" onClick={onEnter}>
            Enter
          </button>

          {ready ? (
            user ? (
              <div className="home__auth home__auth--in">
                <span className="home__user" title={user.email ?? ''}>
                  {user.displayName ?? user.email}
                </span>
                <button
                  type="button"
                  className="home__quiet"
                  disabled={busy}
                  onClick={() => void signOutUser()}
                >
                  Sign out
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="home__quiet"
                disabled={busy}
                onClick={() => void signInWithGoogle()}
              >
                Sign in with Google
              </button>
            )
          ) : null}

          <button
            type="button"
            className="home__quiet"
            aria-haspopup="dialog"
            aria-expanded={aboutOpen}
            onClick={() => setAboutOpen(true)}
          >
            About Data Fossil
          </button>
        </div>

        {error ? (
          <p className="home__error" role="status">
            {error}
          </p>
        ) : null}
      </aside>

      <div className="home__stage">
        <HomeHeroCanvas />
      </div>

      {aboutOpen ? (
        <div
          className="home__about-page"
          role="dialog"
          aria-modal="true"
          aria-labelledby="about-heading"
        >
          <button
            type="button"
            className="home__about-close"
            aria-label="Close"
            onClick={() => setAboutOpen(false)}
          >
            ×
          </button>
          <div className="home__about-panel">
            <h2 id="about-heading" className="home__about-heading">
              About Data Fossil
            </h2>
            <div className="home__about-body">
              {ABOUT.map((para) => (
                <p key={para.slice(0, 24)}>{para}</p>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
