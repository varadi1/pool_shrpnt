import { 
  Button, 
  Title1,
  Table,
  TableHeader,
  TableRow,
  TableHeaderCell,
  TableBody,
  TableCell,
  Badge,
  Card,
  Text
} from '@fluentui/react-components';
import { 
  AddRegular,
  EyeRegular,
  EditRegular,
  FolderOpenRegular
} from '@fluentui/react-icons';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';

interface Order {
  id: string;
  code: string;
  name: string;
  contractName: string;
  status: 'active' | 'draft' | 'completed' | 'provisioning';
  createdDate: string;
  deadline: string;
  partsCount: number;
}

export const Orders = () => {
  const navigate = useNavigate();
  
  // Get orders from localStorage if exists
  const getOrdersFromStorage = (): Order[] => {
    const storedOrders = localStorage.getItem('orders-list');
    if (storedOrders) {
      try {
        return JSON.parse(storedOrders);
      } catch {
        // If parse fails, return default mock data
      }
    }
    
    // Default mock data
    return [
    {
      id: '1',
      code: 'EM-2025-NEU001-001',
      name: 'Q1 Marketing Campaign',
      contractName: 'NEU Marketing 2025',
      status: 'active',
      createdDate: '2025-01-05',
      deadline: '2025-03-31',
      partsCount: 3
    },
    {
      id: '2',
      code: 'EM-2025-NEU002-001',
      name: 'Product Launch Materials',
      contractName: 'NEU Product Dev 2025',
      status: 'provisioning',
      createdDate: '2025-01-08',
      deadline: '2025-02-28',
      partsCount: 2
    },
    {
      id: '3',
      code: 'EM-2024-NEU001-042',
      name: 'Year-End Campaign',
      contractName: 'NEU Marketing 2024',
      status: 'completed',
      createdDate: '2024-11-15',
      deadline: '2024-12-31',
      partsCount: 3
    },
    {
      id: '4',
      code: 'EM-2025-NEU003-001',
      name: 'Training Materials',
      contractName: 'NEU Training Services',
      status: 'draft',
      createdDate: '2025-01-09',
      deadline: '2025-04-15',
      partsCount: 1
    }
    ];
  };
  
  const [orders] = useState<Order[]>(getOrdersFromStorage());

  const getStatusBadge = (status: Order['status']) => {
    const colorMap = {
      active: 'success' as const,
      provisioning: 'warning' as const,
      completed: 'informative' as const,
      draft: 'subtle' as const
    };
    
    const labelMap = {
      active: 'Aktív',
      provisioning: 'Létrehozás alatt',
      completed: 'Befejezett',
      draft: 'Piszkozat'
    };

    return (
      <Badge appearance="filled" color={colorMap[status]}>
        {labelMap[status]}
      </Badge>
    );
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <Title1>Megrendelések</Title1>
          <Text size={400} style={{ color: 'var(--colorNeutralForeground3)' }}>
            Összes megrendelés kezelése és nyomon követése
          </Text>
        </div>
        <Button 
          appearance="primary" 
          onClick={() => navigate('/orders/new')} 
          data-testid="orders-new-btn"
          icon={<AddRegular />}
        >
          Új Megrendelés
        </Button>
      </div>

      <Card style={{ padding: '16px' }}>
        <Table aria-label="Megrendelések táblázat">
          <TableHeader>
            <TableRow>
              <TableHeaderCell>Kód</TableHeaderCell>
              <TableHeaderCell>Név</TableHeaderCell>
              <TableHeaderCell>Szerződés</TableHeaderCell>
              <TableHeaderCell>Állapot</TableHeaderCell>
              <TableHeaderCell>Létrehozva</TableHeaderCell>
              <TableHeaderCell>Határidő</TableHeaderCell>
              <TableHeaderCell>Részek</TableHeaderCell>
              <TableHeaderCell>Műveletek</TableHeaderCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((order) => (
              <TableRow key={order.id}>
                <TableCell>
                  <Text weight="semibold">{order.code}</Text>
                </TableCell>
                <TableCell>{order.name}</TableCell>
                <TableCell>{order.contractName}</TableCell>
                <TableCell>{getStatusBadge(order.status)}</TableCell>
                <TableCell>{order.createdDate}</TableCell>
                <TableCell>{order.deadline}</TableCell>
                <TableCell>
                  <Badge appearance="tint">{order.partsCount} rész</Badge>
                </TableCell>
                <TableCell>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button 
                      size="small" 
                      icon={<EyeRegular />} 
                      appearance="subtle"
                      title="Megtekintés"
                    />
                    <Button 
                      size="small" 
                      icon={<EditRegular />} 
                      appearance="subtle"
                      title="Szerkesztés"
                      disabled={order.status === 'completed'}
                    />
                    <Button 
                      size="small" 
                      icon={<FolderOpenRegular />} 
                      appearance="subtle"
                      title="SharePoint megnyitása"
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
};
