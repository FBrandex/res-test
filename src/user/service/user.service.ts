import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { from, Observable } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { AuthService } from 'src/auth/services/auth/auth.service';
import { Repository } from 'typeorm';
import { CreateUserDto } from '../models/dto/CreateUser.dto';
import { LoginUserDto } from '../models/dto/LoginUser.dto';
import { UserEntity } from '../models/user.entity';
import { UserI } from '../models/user.interface';

@Injectable()
export class UserService {

  constructor(
    @InjectRepository(UserEntity)
    private userRepository: Repository<UserEntity>,
    private authService: AuthService
  ) { }

  create(createdUserDto: CreateUserDto): Observable<UserI> {
    const userEntity = this.userRepository.create(createdUserDto);

    return this.mailExists(userEntity.email).pipe(
      switchMap((exists: boolean) => {
        if (!exists) {
          return this.authService.hashPassword(userEntity.password).pipe(
            switchMap((passwordHash: string) => {
              // Overwrite the user password with the hash, to store it in the db
              userEntity.password = passwordHash;
              return from(this.userRepository.save(userEntity)).pipe(
                map((savedUser: UserI) => {
                  const { password, ...user } = savedUser;
                  return user;
                })
              )
            })
          )
        } else {
          throw new HttpException('Email already in use', HttpStatus.CONFLICT);
        }
      })
    )
  }

  login(loginUserDto: LoginUserDto): Observable<string> {
    return this.findUserByEmail(loginUserDto.email.toLowerCase()).pipe(
      switchMap((user: UserI) => {
        if (user) {
          console.log('aqui ', loginUserDto.password,' ', user.password )
          return this.validatePassword(loginUserDto.password, user.password).pipe(
            switchMap((passwordsMatches: boolean) => {
              if (passwordsMatches) {
                return this.findOne(user.id).pipe(
                  switchMap((user: UserI) => this.authService.generateJwt(user))
                )
              } else {
                throw new HttpException('Login was not Successfulll', HttpStatus.UNAUTHORIZED);
              }
            })
          )
        } else {
          throw new HttpException('User not found', HttpStatus.NOT_FOUND);
        }
      }
      )
    )
  }

  findAll(): Observable<UserI[]> {
    return from(this.userRepository.find());
  }

  findOne(id: number): Observable<UserI> {
    return from(this.userRepository.findOne({where: {id}}));
  }

  private findUserByEmail(email: string): Observable<UserI> {
    return from(this.userRepository.findOne({select: ['id', 'name', 'email', 'password'], where:{email}}));
  }

  private validatePassword(password: string, storedPasswordHash: string): Observable<boolean> {
    return this.authService.comparePasswords(password, storedPasswordHash);
  }

  private mailExists(email: string): Observable<boolean> {
    email = email.toLowerCase();
    return from(this.userRepository.findOne({where: {email}})).pipe(
      map((user: UserI) => {
        if (user) {
          return true;
        } else {
          return false;
        }
      })
    )
  }

}
