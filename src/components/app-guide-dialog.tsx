import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function AppGuideDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Guía de uso de Qanta</DialogTitle>
          <DialogDescription>
            Qanta es un ERP flexible que se adapta a tu operación personal o empresarial.
            Aquí tienes recomendaciones para arrancar según tu caso.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="personal" className="mt-2">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="personal">Uso personal / finanzas personales</TabsTrigger>
            <TabsTrigger value="empresa">Uso empresarial</TabsTrigger>
          </TabsList>

          <TabsContent value="personal" className="space-y-3 text-sm mt-4">
            <p>Si Qanta es tu tablero personal, enfócate en unos pocos módulos:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Finanzas</strong>: usa el resumen para ver ingresos y gastos, y <em>Bancos</em> para conciliar tus cuentas.</li>
              <li><strong>Agenda y Hábitos</strong>: planifica tu semana y realiza seguimiento de rutinas personales.</li>
              <li><strong>Recordatorios</strong>: recibe avisos por correo de pagos, citas o tareas periódicas.</li>
              <li><strong>Documentos</strong>: guarda facturas, contratos o comprobantes en la nube segura de Qanta.</li>
            </ul>
            <p>
              Puedes ignorar Inventario, Ventas, RRHH, CRM y Proyectos: son módulos empresariales.
              Como propietario, puedes crear un <strong>rol personalizado</strong> desde
              «Roles y permisos» que solo habilite los módulos personales, dejando el navegador
              más limpio.
            </p>
          </TabsContent>

          <TabsContent value="empresa" className="space-y-3 text-sm mt-4">
            <p>Para una empresa, Qanta cubre las áreas típicas de un ERP:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <strong>Finanzas</strong>: resumen ejecutivo, asientos contables NIIF, políticas,
                terceros, bancos, impuestos y conciliación.
              </li>
              <li><strong>Inventario / Compras</strong>: productos, movimientos, alertas de stock mínimo.</li>
              <li><strong>Ventas</strong>: clientes, facturas con líneas y pagos, PDF descargable.</li>
              <li>
                <strong>RRHH</strong>: personal, nómina, ausencias, organigrama y asistencia con QR.
              </li>
              <li><strong>CRM</strong>: contactos, oportunidades tipo pipeline y actividades.</li>
              <li><strong>Proyectos</strong>: seguimiento con horas facturables por miembro.</li>
              <li><strong>Aprobaciones</strong>: flujo de solicitudes con aprobadores por módulo.</li>
              <li><strong>Reportes</strong>: KPIs cruzados y exportación CSV.</li>
            </ul>
            <p>
              Desde «Roles y permisos» puedes crear roles personalizados y asignarlos a empleados
              para darles acceso solo a los módulos que necesitan.
            </p>
          </TabsContent>
        </Tabs>

        <p className="mt-4 text-xs text-muted-foreground">
          Puedes reabrir esta guía cuando quieras desde el ícono de ayuda en la barra superior.
        </p>
      </DialogContent>
    </Dialog>
  );
}