import { WorkOrderMachineRef } from '../models/work-order.model';

// Referencia de máquina válida para los tests de órdenes (spec 013d): antes cada spec declaraba su
// propio texto libre de "activo". Apunta a la máquina 1 del seed de la API (perfil `dev`), hasta "Motor de cinta".
export const MACHINE_REF_FIXTURE: WorkOrderMachineRef = {
  machineId: '1',
  partId: '3',
  breadcrumb: 'Envasadora línea 1 > Mesa de transporte > Cinta 1 > Motor de cinta',
  comment: 'Vibración fuera de rango',
};

// Referencia a nivel de máquina completa (sin parte).
export const MACHINE_ONLY_REF_FIXTURE: WorkOrderMachineRef = {
  machineId: '1',
  partId: null,
  breadcrumb: 'Envasadora línea 1',
  comment: '',
};
