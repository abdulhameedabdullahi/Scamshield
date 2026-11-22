import DevTestPanel from './components/DevTestPanel';
import { APP_NAME } from './config';

export default function App() {
  return (
    <div style={styles.container}>
      <h1 style={styles.title}>{APP_NAME}</h1>
      <p style={styles.subtitle}>
        Firebase AI Logic hybrid inference — development test panel
      </p>
      <DevTestPanel />
    </div>
  );
}

const styles = {
  container: {
    maxWidth: 720,
    margin: '40px auto',
    padding: '0 20px',
  },
  title: {
    fontSize: '2rem',
    marginBottom: 4,
  },
  subtitle: {
    color: '#6b7280',
    fontSize: '0.95rem',
    marginBottom: 0,
  },
};
