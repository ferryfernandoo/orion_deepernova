import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import bcrypt from 'bcrypt';
import { userDb } from './database.js';
import { v4 as uuidv4 } from 'uuid';

// Configure Local Strategy (email + password)
passport.use(
  new LocalStrategy(
    {
      usernameField: 'email',
      passwordField: 'password'
    },
    async (email, password, done) => {
      try {
        const user = userDb.findByEmail(email.toLowerCase().trim());

        if (!user) {
          return done(null, false, { message: 'Email atau password salah' });
        }

        if (!user.password) {
          return done(null, false, { message: 'Akun ini tidak memiliki password. Silakan hubungi support.' });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (!isPasswordValid) {
          return done(null, false, { message: 'Email atau password salah' });
        }

        return done(null, user);
      } catch (error) {
        return done(error);
      }
    }
  )
);

// Serialize user
passport.serializeUser((user, done) => {
  done(null, user.id);
});

// Deserialize user
passport.deserializeUser((id, done) => {
  try {
    const user = userDb.findById(id);
    done(null, user);
  } catch (error) {
    done(error);
  }
});

// Hash password helper
export const hashPassword = async (password) => {
  const saltRounds = 10;
  return bcrypt.hash(password, saltRounds);
};

export default passport;
