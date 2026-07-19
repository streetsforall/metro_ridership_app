import Map from '../../components/Map';
import { useDashboard } from '../../context/DashboardContext';

export default function MapPanel() {
  const { lines } = useDashboard();

  return <Map lines={lines} />;
}
