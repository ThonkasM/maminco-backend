import { Optional } from '@nestjs/common';
import { IsEmail, IsOptional, IsString } from 'class-validator';

export class LoginDto {
    @IsEmail()
    email: string;

    @IsString()
    password: string;
}
