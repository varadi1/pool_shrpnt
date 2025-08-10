import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
  Text,
  SearchBox,
  Dropdown,
  Option,
  Menu,
  MenuItem,
  MenuTrigger,
  MenuPopover,
  MenuList,
  Spinner,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import {
  ShieldCheckmarkRegular,
  PeopleRegular,
  LockClosedRegular,
  LockOpenRegular,
  EditRegular,
  EyeRegular,
  MoreHorizontalRegular,
  FilterRegular,
  ArrowSyncRegular,
} from '@fluentui/react-icons';
import { useQuery } from '@tanstack/react-query';
import { ordersApi } from '@/services/api/orders';
import type { OrderPermissionSummary } from '@/types/permissions';

const useStyles = makeStyles({
  container: {
    padding: tokens.spacingVerticalXL,
    maxWidth: '1400px',
    margin: '0 auto',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: tokens.spacingVerticalXL,
  },
  filters: {
    display: 'flex',
    gap: tokens.spacingHorizontalM,
    marginBottom: tokens.spacingVerticalL,
    flexWrap: 'wrap',
  },
  searchBox: {
    minWidth: '300px',
    flexGrow: 1,
    maxWidth: '400px',
  },
  statsCard: {
    display: 'flex',
    gap: tokens.spacingHorizontalXL,
    marginBottom: tokens.spacingVerticalL,
    padding: tokens.spacingVerticalM,
  },
  statItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
  tableContainer: {
    borderRadius: tokens.borderRadiusMedium,
    boxShadow: tokens.shadow4,
    overflow: 'hidden',
  },
  lockIndicator: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
  },
  partnerChip: {
    marginRight: tokens.spacingHorizontalXS,
    marginBottom: tokens.spacingVerticalXS,
  },
  actionButtons: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
  },
});

export const PermissionsList = () => {
  const classes = useStyles();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [partnerFilter, setPartnerFilter] = useState<string>('all');

  const { data: orders, isLoading, error, refetch } = useQuery({
    queryKey: ['orders-permissions'],
    queryFn: async () => {
      const ordersData = await ordersApi.getAll();
      
      const permissionSummaries: OrderPermissionSummary[] = ordersData.map(order => ({
        orderId: order.id,
        orderCode: order.code,
        orderName: order.name,
        contractName: 'Contract Name',
        status: order.status as OrderPermissionSummary['status'],
        partners: [
          { id: '1', name: 'Partner A', userCount: 5 },
          { id: '2', name: 'Partner B', userCount: 3 },
        ],
        userCount: 12,
        groupCount: 4,
        lastModified: new Date(order.updatedAt),
        lockStatus: {
          hasLocks: Math.random() > 0.5,
          lockedFolders: Math.floor(Math.random() * 5),
          totalFolders: 15,
        },
      }));
      
      return permissionSummaries;
    },
    refetchInterval: 30000,
  });

  const filteredOrders = orders?.filter(order => {
    const matchesSearch = 
      order.orderCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.orderName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.partners.some(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
    
    const matchesPartner = partnerFilter === 'all' || 
      order.partners.some(p => p.id === partnerFilter);
    
    return matchesSearch && matchesStatus && matchesPartner;
  });

  const uniquePartners = orders?.reduce((acc, order) => {
    order.partners.forEach(partner => {
      if (!acc.find(p => p.id === partner.id)) {
        acc.push(partner);
      }
    });
    return acc;
  }, [] as { id: string; name: string }[]) || [];

  const getStatusBadge = (status: OrderPermissionSummary['status']) => {
    const colorMap = {
      active: 'success' as const,
      provisioning: 'warning' as const,
      completed: 'informative' as const,
      draft: 'subtle' as const,
    };
    
    const labelMap = {
      active: 'Aktív',
      provisioning: 'Létrehozás alatt',
      completed: 'Befejezett',
      draft: 'Piszkozat',
    };

    return (
      <Badge appearance="filled" color={colorMap[status]}>
        {labelMap[status]}
      </Badge>
    );
  };

  const handleNavigateToMatrix = (orderId: string) => {
    navigate(`/permissions/matrix/${orderId}`);
  };

  const handleQuickAction = (action: string, orderId: string) => {
    switch (action) {
      case 'view':
        navigate(`/permissions/matrix/${orderId}?mode=view`);
        break;
      case 'edit':
        navigate(`/permissions/matrix/${orderId}?mode=edit`);
        break;
      case 'audit':
        navigate(`/permissions/audit/${orderId}`);
        break;
      case 'sync':
        console.log('Triggering sync for order:', orderId);
        break;
      default:
        break;
    }
  };

  if (isLoading) {
    return (
      <div className={classes.container}>
        <Spinner label="Jogosultságok betöltése..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className={classes.container}>
        <Card>
          <Text>Hiba történt a jogosultságok betöltése során.</Text>
          <Button onClick={() => refetch()}>Újratöltés</Button>
        </Card>
      </div>
    );
  }

  const totalUsers = filteredOrders?.reduce((sum, order) => sum + order.userCount, 0) || 0;
  const totalGroups = filteredOrders?.reduce((sum, order) => sum + order.groupCount, 0) || 0;
  const ordersWithLocks = filteredOrders?.filter(o => o.lockStatus.hasLocks).length || 0;

  return (
    <div className={classes.container}>
      <div className={classes.header}>
        <div>
          <Title1>Jogosultság kezelés</Title1>
          <Text>Megrendelések jogosultságainak áttekintése és szerkesztése</Text>
        </div>
        <Button
          appearance="primary"
          icon={<ShieldCheckmarkRegular />}
          onClick={() => navigate('/permissions/templates')}
        >
          Sablonok kezelése
        </Button>
      </div>

      <Card className={classes.statsCard}>
        <div className={classes.statItem}>
          <Text weight="semibold">{filteredOrders?.length || 0}</Text>
          <Text size={200}>Megrendelés</Text>
        </div>
        <div className={classes.statItem}>
          <Text weight="semibold">{totalUsers}</Text>
          <Text size={200}>Felhasználó</Text>
        </div>
        <div className={classes.statItem}>
          <Text weight="semibold">{totalGroups}</Text>
          <Text size={200}>Csoport</Text>
        </div>
        <div className={classes.statItem}>
          <Text weight="semibold">{ordersWithLocks}</Text>
          <Text size={200}>Zárolt megrendelés</Text>
        </div>
      </Card>

      <div className={classes.filters}>
        <SearchBox
          className={classes.searchBox}
          placeholder="Keresés megrendelés kód, név vagy partner alapján..."
          value={searchQuery}
          onChange={(_, data) => setSearchQuery(data.value)}
          contentBefore={<FilterRegular />}
        />
        
        <Dropdown
          placeholder="Státusz"
          value={statusFilter === 'all' ? 'Minden státusz' : statusFilter}
          onOptionSelect={(_, data) => setStatusFilter(data.optionValue || 'all')}
        >
          <Option value="all">Minden státusz</Option>
          <Option value="active">Aktív</Option>
          <Option value="provisioning">Létrehozás alatt</Option>
          <Option value="completed">Befejezett</Option>
          <Option value="draft">Piszkozat</Option>
        </Dropdown>

        <Dropdown
          placeholder="Partner"
          value={partnerFilter === 'all' ? 'Minden partner' : partnerFilter}
          onOptionSelect={(_, data) => setPartnerFilter(data.optionValue || 'all')}
        >
          <Option value="all">Minden partner</Option>
          {uniquePartners.map(partner => (
            <Option key={partner.id} value={partner.id}>
              {partner.name}
            </Option>
          ))}
        </Dropdown>

        <Button
          icon={<ArrowSyncRegular />}
          onClick={() => refetch()}
        >
          Frissítés
        </Button>
      </div>

      <Card className={classes.tableContainer}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHeaderCell>Megrendelés kód</TableHeaderCell>
              <TableHeaderCell>Megnevezés</TableHeaderCell>
              <TableHeaderCell>Partnerek</TableHeaderCell>
              <TableHeaderCell>Felhasználók / Csoportok</TableHeaderCell>
              <TableHeaderCell>Zárolás</TableHeaderCell>
              <TableHeaderCell>Státusz</TableHeaderCell>
              <TableHeaderCell>Utolsó módosítás</TableHeaderCell>
              <TableHeaderCell>Műveletek</TableHeaderCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredOrders?.map((order) => (
              <TableRow key={order.orderId}>
                <TableCell>
                  <Text weight="semibold">{order.orderCode}</Text>
                </TableCell>
                <TableCell>
                  <div>
                    <Text>{order.orderName}</Text>
                    <Text size={200}>{order.contractName}</Text>
                  </div>
                </TableCell>
                <TableCell>
                  <div>
                    {order.partners.slice(0, 2).map(partner => (
                      <Badge
                        key={partner.id}
                        className={classes.partnerChip}
                        appearance="tint"
                      >
                        {partner.name} ({partner.userCount})
                      </Badge>
                    ))}
                    {order.partners.length > 2 && (
                      <Text size={200}>+{order.partners.length - 2} további</Text>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <PeopleRegular />
                    <Text>{order.userCount} / {order.groupCount}</Text>
                  </div>
                </TableCell>
                <TableCell>
                  <div className={classes.lockIndicator}>
                    {order.lockStatus.hasLocks ? (
                      <>
                        <LockClosedRegular />
                        <Text>{order.lockStatus.lockedFolders}/{order.lockStatus.totalFolders}</Text>
                      </>
                    ) : (
                      <>
                        <LockOpenRegular />
                        <Text>Nincs zárolás</Text>
                      </>
                    )}
                  </div>
                </TableCell>
                <TableCell>{getStatusBadge(order.status)}</TableCell>
                <TableCell>
                  {order.lastModified && (
                    <Text size={200}>
                      {new Date(order.lastModified).toLocaleDateString('hu-HU')}
                    </Text>
                  )}
                </TableCell>
                <TableCell>
                  <div className={classes.actionButtons}>
                    <Button
                      appearance="subtle"
                      icon={<EditRegular />}
                      size="small"
                      onClick={() => handleNavigateToMatrix(order.orderId)}
                    >
                      Mátrix
                    </Button>
                    
                    <Menu>
                      <MenuTrigger disableButtonEnhancement>
                        <Button
                          appearance="subtle"
                          icon={<MoreHorizontalRegular />}
                          size="small"
                        />
                      </MenuTrigger>
                      <MenuPopover>
                        <MenuList>
                          <MenuItem
                            icon={<EyeRegular />}
                            onClick={() => handleQuickAction('view', order.orderId)}
                          >
                            Megtekintés
                          </MenuItem>
                          <MenuItem
                            icon={<EditRegular />}
                            onClick={() => handleQuickAction('edit', order.orderId)}
                          >
                            Szerkesztés
                          </MenuItem>
                          <MenuItem
                            icon={<ShieldCheckmarkRegular />}
                            onClick={() => handleQuickAction('audit', order.orderId)}
                          >
                            Audit napló
                          </MenuItem>
                          <MenuItem
                            icon={<ArrowSyncRegular />}
                            onClick={() => handleQuickAction('sync', order.orderId)}
                          >
                            SharePoint szinkron
                          </MenuItem>
                        </MenuList>
                      </MenuPopover>
                    </Menu>
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