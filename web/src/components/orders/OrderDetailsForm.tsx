import React, { useEffect, useState } from 'react';
import {
  Field,
  Input,
  Textarea,
  Dropdown,
  Option,
  Text,
  makeStyles,
  shorthands,
} from '@fluentui/react-components';
import { CalendarRegular, InfoRegular } from '@fluentui/react-icons';
import { getNextSequence } from '@/services/api/orders';

const useStyles = makeStyles({
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  row: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
  },
  fullWidth: {
    gridColumn: '1 / -1',
  },
  codePreview: {
    ...shorthands.padding('8px'),
    ...shorthands.border('1px', 'solid', 'var(--colorNeutralStroke1)'),
    ...shorthands.borderRadius('4px'),
    backgroundColor: 'var(--colorNeutralBackground2)',
    fontFamily: 'monospace',
    fontSize: '14px',
  },
  infoText: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    color: 'var(--colorNeutralForeground3)',
    fontSize: '12px',
  },
});

interface OrderDetailsFormProps {
  contractNumber?: string;
  value: {
    orderName?: string;
    orderCode?: string;
    description?: string;
    startDate?: Date;
    endDate?: Date;
    orderType?: string;
  };
  onChange: (data: any) => void;
}

export const OrderDetailsForm: React.FC<OrderDetailsFormProps> = ({ 
  contractNumber,
  value,
  onChange 
}) => {
  const styles = useStyles();
  const [orderName, setOrderName] = useState(value.orderName || '');
  const [description, setDescription] = useState(value.description || '');
  const [startDate, setStartDate] = useState<Date | null | undefined>(value.startDate || new Date());
  const [endDate, setEndDate] = useState<Date | null | undefined>(value.endDate || null);
  const [orderType, setOrderType] = useState(value.orderType || 'standard');
  const [orderCode, setOrderCode] = useState(value.orderCode || '');

  // Generate order code when contract number is available
  useEffect(() => {
    if (contractNumber && !value.orderCode) {
      generateOrderCode(contractNumber);
    }
  }, [contractNumber]);

  const generateOrderCode = async (contractCode: string) => {
    const year = new Date().getFullYear();
    const sequence = await getNextSequence(contractCode);
    const code = `EM-${year}-${contractCode}-${sequence.toString().padStart(3, '0')}`;
    setOrderCode(code);
    updateParent({ orderCode: code });
  };

  const updateParent = (updates: any) => {
    onChange({
      orderName,
      orderCode,
      description,
      startDate,
      endDate,
      orderType,
      ...updates,
    });
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setOrderName(e.target.value);
    updateParent({ orderName: e.target.value });
  };

  const handleDescriptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDescription(e.target.value);
    updateParent({ description: e.target.value });
  };

  const handleStartDateChange = (date: Date | null | undefined) => {
    setStartDate(date);
    updateParent({ startDate: date });
  };

  const handleEndDateChange = (date: Date | null | undefined) => {
    setEndDate(date);
    updateParent({ endDate: date });
  };

  const handleOrderTypeChange = (_: any, data: { value: string }) => {
    setOrderType(data.value);
    updateParent({ orderType: data.value });
  };

  const validateDates = (): string | null => {
    if (startDate && endDate) {
      if (endDate <= startDate) {
        return 'End date must be after start date';
      }
    }
    return null;
  };

  const dateError = validateDates();

  return (
    <div className={styles.container}>
      <Field label="Order Code" required>
        <div className={styles.codePreview}>
          {orderCode || 'Code will be generated automatically'}
        </div>
        <div className={styles.infoText}>
          <InfoRegular />
          <Text>Format: EM-YEAR-CONTRACT-SEQUENCE</Text>
        </div>
      </Field>

      <Field 
        label="Order Name" 
        required 
        validationMessage={
          !orderName
            ? 'Order name is required'
            : orderName.length < 3
              ? 'Order name must be at least 3 characters'
              : undefined
        }
        validationState={orderName && orderName.length < 3 ? 'error' : undefined}
      >
        <Input
          aria-label="Order Name"
          value={orderName}
          onChange={handleNameChange}
          placeholder="Enter order name"
        />
      </Field>

      <Field label="Description" className={styles.fullWidth}>
        <Textarea
          value={description}
          onChange={handleDescriptionChange}
          placeholder="Enter order description (optional)"
          rows={3}
        />
      </Field>

      <div className={styles.row}>
        <Field label="Start Date" required>
          <Input
            type="date"
            value={startDate ? startDate.toISOString().split('T')[0] : ''}
            onChange={(e) => handleStartDateChange(e.target.value ? new Date(e.target.value) : null)}
            contentAfter={<CalendarRegular />}
          />
        </Field>

        <Field 
          label="End Date" 
          required 
          validationMessage={dateError || (!endDate ? 'End date is required' : undefined)}
          validationState={dateError ? 'error' : undefined}
        >
          <Input
            type="date"
            value={endDate ? endDate.toISOString().split('T')[0] : ''}
            onChange={(e) => handleEndDateChange(e.target.value ? new Date(e.target.value) : null)}
            min={startDate ? startDate.toISOString().split('T')[0] : undefined}
            contentAfter={<CalendarRegular />}
          />
        </Field>
      </div>

      <Field label="Order Type">
        <Dropdown
          value={orderType === 'standard' ? 'Standard' : orderType === 'urgent' ? 'Urgent' : 'Special'}
          selectedOptions={[orderType]}
          onOptionSelect={handleOrderTypeChange}
        >
          <Option value="standard">Standard</Option>
          <Option value="urgent">Urgent</Option>
          <Option value="special">Special</Option>
        </Dropdown>
      </Field>
    </div>
  );
};

export default OrderDetailsForm;