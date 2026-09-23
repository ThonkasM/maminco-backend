import { IsEmail, IsString, MinLength } from 'class-validator';

/**
 * DTO para registrar el primer administrador
 *
 * Este endpoint NO requiere autenticación previa
 * Solo funciona si no existe ningún usuario en la BD
 */
export class RegisterFirstAdminDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsString()
  @MinLength(2)
  name: string;
}
