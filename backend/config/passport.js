const passport = require('passport');
const { Strategy } = require('passport-google-oauth20');
const User = require('../models/User');

passport.use(
  new Strategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID || 'unset',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'unset',
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
    },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        const e = profile.emails && profile.emails[0];
        const email = e && e.value ? e.value.toLowerCase() : null;
        const verified = e && (e.verified === true || e.verified === 'true');
        if (!email || !verified) return done(null, false); // only trust verified Google emails

        const avatar = profile.photos && profile.photos[0] && profile.photos[0].value;
        let user = await User.findOne({ email });

        if (user) {
          // Returning user (maybe registered with email/password earlier): link Google, no welcome mail
          if (!user.googleId) user.googleId = profile.id;
          if (!user.avatar && avatar) user.avatar = avatar;
          await user.save();
          return done(null, { user, isNew: false });
        }

        try {
          user = await User.create({
            name: profile.displayName || email.split('@')[0],
            email,
            googleId: profile.id,
            avatar,
          });
          return done(null, { user, isNew: true });
        } catch (err) {
          if (err.code === 11000) {
            user = await User.findOne({ email });
            return done(null, { user, isNew: false });
          }
          throw err;
        }
      } catch (err) {
        done(err);
      }
    }
  )
);
