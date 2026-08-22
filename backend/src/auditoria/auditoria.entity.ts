import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('auditoria')
export class Auditoria {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'nvarchar', length: 100, nullable: true })
  usuario: string | null;

  @Column({ type: 'nvarchar', length: 100 })
  accion: string;

  @Column({ type: 'nvarchar', length: 100, nullable: true })
  entidad: string | null;

  @Column({ type: 'int', nullable: true, name: 'entidad_id' })
  entidadId: number | null;

  @Column({ type: 'ntext', nullable: true })
  detalle: string | null;

  @Column({ type: 'nvarchar', length: 50, nullable: true })
  ip: string | null;

  @Column({ type: 'nvarchar', length: 300, nullable: true, name: 'user_agent' })
  userAgent: string | null;

  @CreateDateColumn({ type: 'datetime2', name: 'fecha' })
  fecha: Date;
}