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
      setError('Please enter a valid email address');
      return;
    }

    if (!formData.displayName.trim()) {
      setError('Display name is required');
      return;
    }

    if (!formData.partnerCompanyId) {
      setError('Please select a partner company');
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
        setSuccess(`Guest invitation sent successfully to ${formData.email}`);
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
      const errorMessage = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Failed to send guest invitation';
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
            <PersonAdd20Regular /> Invite Guest User
          </Title3>
        }
      />
      <form className={styles.form} onSubmit={handleSubmit}>
        <Field
          label="Email Address"
          required
          validationState={error && !validateEmail(formData.email) ? 'error' : undefined}
          validationMessage={error && !validateEmail(formData.email) ? 'Invalid email format' : undefined}
        >
          <Input
            type="email"
            value={formData.email}
            onChange={(e, data) => handleInputChange('email', data.value)}
            placeholder="guest@partner.com"
            contentBefore={<Mail20Regular />}
            disabled={isSubmitting}
            required
          />
        </Field>

        <Field label="Display Name" required>
          <Input
            value={formData.displayName}
            onChange={(e, data) => handleInputChange('displayName', data.value)}
            placeholder="John Doe"
            contentBefore={<PersonAdd20Regular />}
            disabled={isSubmitting}
            required
          />
        </Field>

        <Field label="Partner Company" required>
          <Select
            value={formData.partnerCompanyId}
            onChange={(e, data) => handleInputChange('partnerCompanyId', data.value)}
            disabled={isSubmitting}
          >
            <option value="">Select a partner company</option>
            {partners.map((partner) => (
              <option key={partner.id} value={partner.id}>
                {partner.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Role" required>
          <Select
            value={formData.role}
            onChange={(e, data) => handleInputChange('role', data.value)}
            disabled={isSubmitting}
          >
            <option value="partner_viewer">Partner Viewer (Read-only)</option>
            <option value="partner_expert">Partner Expert (Contributor)</option>
            <option value="partner_admin">Partner Admin (Full access)</option>
            <option value="neu_pm">NEÜ Project Manager</option>
          </Select>
        </Field>

        <Field label="Custom Message (Optional)">
          <Textarea
            value={formData.message}
            onChange={(e, data) => handleInputChange('message', data.value)}
            placeholder="Add a personalized message to the invitation email..."
            rows={3}
            disabled={isSubmitting}
          />
        </Field>

        {error && (
          <MessageBar intent="error" className={styles.errorMessage}>
            <MessageBarBody>
              <MessageBarTitle>Error</MessageBarTitle>
              {error}
            </MessageBarBody>
          </MessageBar>
        )}

        {success && (
          <MessageBar intent="success" className={styles.successMessage}>
            <MessageBarBody>
              <MessageBarTitle>Success</MessageBarTitle>
              {success}
            </MessageBarBody>
          </MessageBar>
        )}

        <div className={styles.buttonGroup}>
          {onCancel && (
            <Button appearance="secondary" onClick={onCancel} disabled={isSubmitting}>
              Cancel
            </Button>
          )}
          <Button
            appearance="primary"
            type="submit"
            disabled={isSubmitting || !formData.email || !formData.displayName || !formData.partnerCompanyId}
            icon={isSubmitting ? <Spinner size="tiny" /> : <PersonAdd20Regular />}
          >
            {isSubmitting ? 'Sending Invitation...' : 'Send Invitation'}
          </Button>
        </div>
      </form>
    </Card>
  );
};