import { useState } from 'react';
import { 
  Title1, 
  makeStyles, 
  tokens,
  Select,
  Field,
} from '@fluentui/react-components';
import { ManualLockPanel } from '../components/locks';

const useStyles = makeStyles({
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    padding: tokens.spacingHorizontalL,
  },
  header: {
    marginBottom: tokens.spacingVerticalL,
  },
  selector: {
    maxWidth: '400px',
  },
});

export const Locks = () => {
  const styles = useStyles();
  const [selectedEmId, setSelectedEmId] = useState<string>('');

  const mockEMs = [
    { id: 'em-001', name: 'EM 2025/A/001' },
    { id: 'em-002', name: 'EM 2025/A/002' },
    { id: 'em-003', name: 'EM 2025/B/001' },
  ];

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <Title1>Lock Management</Title1>
      </div>
      
      <Field label="Select Order EM" className={styles.selector}>
        <Select
          value={selectedEmId}
          onChange={(_, data) => setSelectedEmId(data.value)}
        >
          <option value="">-- Select an EM --</option>
          {mockEMs.map(em => (
            <option key={em.id} value={em.id}>
              {em.name}
            </option>
          ))}
        </Select>
      </Field>

      {selectedEmId && (
        <ManualLockPanel 
          emId={selectedEmId} 
          emName={mockEMs.find(em => em.id === selectedEmId)?.name}
        />
      )}
    </div>
  );
};
