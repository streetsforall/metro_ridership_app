export interface TransitEvent {
  id: string;
  date: string;
  line_ids: number[];
  title: string;
  description: string;
  category: 'opening' | 'extension' | 'disruption' | 'service_change';
}
