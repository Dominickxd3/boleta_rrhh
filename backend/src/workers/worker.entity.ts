import {
  AfterLoad,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('trabajadores')
export class Worker {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  dni: string;

  @Column()
  nombres: string;

  @Column({ name: 'apellido_paterno' })
  apellidoPaterno: string;

  @Column({ name: 'apellido_materno' })
  apellidoMaterno: string;

  @Column({ nullable: true })
  email: string;

  @Column({ nullable: true })
  telefono: string;

  @Column({ nullable: true })
  area: string;

  @Column({ nullable: true })
  cargo: string;

  @Column({ default: true })
  activo: boolean;

  nombreCompleto: string;

  @CreateDateColumn({ name: 'creado_en' })
  creadoEn: Date;

  @AfterLoad()
  setNombreCompleto(): void {
    this.nombreCompleto = `${this.apellidoPaterno} ${this.apellidoMaterno} ${this.nombres}`.trim();
  }
}
