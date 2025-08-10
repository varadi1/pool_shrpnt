import { useState } from 'react';
import {
  Button,
  Input,
  Select,
  Textarea,
  Field,
  Spinner,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  makeStyles,
  Card,
  CardHeader,
  Title3,
} from '@fluentui/react-components';
import {
  PersonAdd20Regular,
  Mail20Regular,
} from '@fluentui/react-icons';
import { api } from '@/services/api';

const useStyles = makeStyles({
  card: {
    maxWidth: '600px',
    margin: '0 auto',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    padding: '16px',
  },
  buttonGroup: {
    display: 'flex',
    gap: '8px',
    justifyContent: 'flex-end',
    marginTop: '16px',
  },
  successMessage: {
    marginTop: '16px',
  },
  errorMessage: {
    marginTop: '16px',
  },
});

interface GuestInviteFormProps {
  onSuccess?: () => void;
  onCancel?: () => void;
}

interface InviteFormData {
  email: string;
  displayName: string;
  partnerCompanyId: string;
  role: string;
  message?: string;
}

interface PartnerCompany {
  id: string;
  name: string;
}

export const GuestInviteForm = ({ onSuccess, onCancel }: GuestInviteFormProps) => {
  const styles = useStyles();
  const [formData, setFormData] = useState<InviteFormData>({
    email: '',
    displayName: '',
    partnerCompanyId: '',
    role: 'partner_viewer',
    message: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [partners] = useState<PartnerCompany[]>([
    { id: 'partner1', name: 'Partner Company 1' },
    { id: 'partner2', name: 'Partner Company 2' },
    { id: 'neu', name: 'NEÜ' },
  ]);

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!validateEmail(formData.email)) {
      setError('Kérjük, adjon meg egy érvényes email címet');
      return;
    }

    if (!formData.displayName.trim()) {
      setError('A megjelenítendő név kötelező');
      return;
    }

    if (!formData.partnerCompanyId) {
      setError('Kérjük, válasszon egy partner céget');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await api.post('/api/guests', {
        email: formData.email,
        display_name: formData.displayName,
        partner_company_id: formData.partnerCompanyId,
        role: formData.role,
        custom_message: formData.message,
      });

      if (response.data) {
        setSuccess(`Vendég meghívó sikeresen elküldve ide: ${formData.email}`);
        setFormData({
          email: '',
          displayName: '',
          partnerCompanyId: '',
          role: 'partner_viewer',
          message: '',
        });
        
        if (onSuccess) {
          setTimeout(onSuccess, 2000);
        }
      }
    } catch (err: unknown) {
      const errorMessage = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Nem sikerült elküldeni a vendég meghívót';
      setError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (field: keyof InviteFormData, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
    setError(null);
    setSuccess(null);
  };

  return (
    <Card className={styles.card}>
      <CardHeader
        header={
          <Title3>
            <PersonAdd20Regular /> Vendég Felhasználó Meghívása
          </Title3>
        }
      />
      <form className={styles.form} onSubmit={handleSubmit}>
        <Field
          label="Email Cím"
          required
          validationState={error && !validateEmail(formData.email) ? 'error' : undefined}
          validationMessage={error && !validateEmail(formData.email) ? 'Érvénytelen email formátum' : undefined}
        >
          <Input
            type="email"
            value={formData.email}
            onChange={(e, data) => handleInputChange('email', data.value)}
            placeholder="vendeg@partner.com"
            contentBefore={<Mail20Regular />}
            disabled={isSubmitting}
            required
          />
        </Field>

        <Field label="Megjelenítendő Név" required>
          <Input
            value={formData.displayName}
            onChange={(e, data) => handleInputChange('displayName', data.value)}
            placeholder="Kovács János"
            contentBefore={<PersonAdd20Regular />}
            disabled={isSubmitting}
            required
          />
        </Field>

        <Field label="Partner Cég" required>
          <Select
            value={formData.partnerCompanyId}
            onChange={(e, data) => handleInputChange('partnerCompanyId', data.value)}
            disabled={isSubmitting}
          >
            <option value="">Válasszon partner céget</option>
            {partners.map((partner) => (
              <option key={partner.id} value={partner.id}>
                {partner.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Szerepkör" required>
          <Select
            value={formData.role}
            onChange={(e, data) => handleInputChange('role', data.value)}
            disabled={isSubmitting}
          >
            <option value="partner_viewer">Partner Néző (Csak olvasás)</option>
            <option value="partner_expert">Partner Szakértő (Közreműködő)</option>
            <option value="partner_admin">Partner Adminisztrátor (Teljes hozzáférés)</option>
            <option value="neu_pm">NEÜ Projektmenedzser</option>
          </Select>
        </Field>

        <Field label="Egyéni üzenet (Opcionális)">
          <Textarea
            value={formData.message}
            onChange={(e, data) => handleInputChange('message', data.value)}
            placeholder="Adjon hozzá egy személyre szabott üzenetet a meghívó emailhez..."
            rows={3}
            disabled={isSubmitting}
          />
        </Field>

        {error && (
          <MessageBar intent="error" className={styles.errorMessage}>
            <MessageBarBody>
              <MessageBarTitle>Hiba</MessageBarTitle>
              {error}
            </MessageBarBody>
          </MessageBar>
        )}

        {success && (
          <MessageBar intent="success" className={styles.successMessage}>
            <MessageBarBody>
              <MessageBarTitle>Sikeres</MessageBarTitle>
              {success}
            </MessageBarBody>
          </MessageBar>
        )}

        <div className={styles.buttonGroup}>
          {onCancel && (
            <Button appearance="secondary" onClick={onCancel} disabled={isSubmitting}>
              Mégse
            </Button>
          )}
          <Button
            appearance="primary"
            type="submit"
            disabled={isSubmitting || !formData.email || !formData.displayName || !formData.partnerCompanyId}
            icon={isSubmitting ? <Spinner size="tiny" /> : <PersonAdd20Regular />}
          >
            {isSubmitting ? 'Meghívó küldése...' : 'Meghívó Küldése'}
          </Button>
        </div>
      </form>
    </Card>
  );
};