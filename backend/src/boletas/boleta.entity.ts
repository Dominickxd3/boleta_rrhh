import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Worker } from '../workers/worker.entity';

@Entity('boletas')
export class Boleta {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', name: 'trabajador_id' })
  trabajadorId: number;

  @ManyToOne(() => Worker, { eager: true })
  @JoinColumn({ name: 'trabajador_id' })
  trabajador: Worker;

  @Column({ type: 'varchar', length: 6 })
  periodo: string;

  @Column({ type: 'int' })
  anio: number;

  @Column({ type: 'int' })
  mes: number;

  @Column({ type: 'ntext', name: 'detalle_json' })
  detalleJson: string;

  @Column({ type: 'varchar', length: 20, default: 'PENDIENTE' })
  estado: string;

  @Column({ type: 'datetime2', nullable: true, name: 'fecha_firmado' })
  fechaFirmado: Date | null;

  @Column({ type: 'nvarchar', length: 500, nullable: true, name: 'ruta_pdf' })
  rutaPdf: string | null;

  @Column({
    type: 'nvarchar',
    length: 200,
    unique: true,
    nullable: true,
    name: 'token_firma',
  })
  tokenFirma: string | null;

  @Column({
    type: 'nvarchar',
    length: 200,
    unique: true,
    nullable: true,
    name: 'token_ver',
  })
  tokenVer: string | null;

  @Column({ type: 'ntext', nullable: true, name: 'firma_png' })
  firmaPng: string | null;

  @Column({ type: 'bit', default: false, name: 'email_enviado' })
  emailEnviado: boolean;

  @Column({ type: 'datetime2', nullable: true, name: 'fecha_email' })
  fechaEmail: Date | null;

  @Column({ type: 'datetime2', nullable: true, name: 'firma_expira' })
  firmaExpira: Date | null;

  @CreateDateColumn({ type: 'datetime2', name: 'creado_en' })
  creadoEn: Date;
}
