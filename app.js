//jshint esversion:6
require("dotenv").config();
const express  = require("express");
const bodyParser = require("body-parser");
const ejs = require("ejs");
const mongoose = require("mongoose");
const session = require("express-session");
const passport = require("passport");
const passportLocalMongoose = require("passport-local-mongoose"); //hash and salt passwords and save users into mongoDB Database
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const FacebookStrategy = require("passport-facebook").Strategy;
const findOrCreate = require("mongoose-findorcreate");

// INITIAL CONFIGURATIONS
const app = express();

app.use(express.static("public"));
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({
  extended: true
}));

app.use(session({
  secret: "Our little secret.",
  resave: false,
  saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());

// CONNECTING TO LOCAL DATABASE

mongoose.connect("mongodb://localhost:27017/userDB");

// CREATING SCHEMA

const userSchema = mongoose.Schema({
  username: { type: String, unique: true }, // values: email address, googleId, facebookId
  password: String,
  provider: String, // values: 'local', 'google', 'facebook'
  email: String,
  secret: String
});

userSchema.plugin(passportLocalMongoose, { usernameField: "username"}); // LOCAL
userSchema.plugin(findOrCreate); // GOOGLE & FACEBOOK

const User = new mongoose.model("User", userSchema);

//STRATEGIES

passport.use(User.createStrategy()); // LOCAL

passport.serializeUser(function(user, done) {
  done(null, user.id);
});

passport.deserializeUser(function(id, done) {
  User.findById(id, function(err, user){
    done(err, user);
  });
});

passport.use(new GoogleStrategy({ // GOOGLE
    clientID: process.env.GOOGLE_ID,
    clientSecret: process.env.GOOGLE_SECRET,
    callbackURL: "http://localhost:3000/auth/google/secrets",
    userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo"
  },
  function(accessToken, refreshToken, profile, cb) {
    console.log(profile);
    User.findOrCreate(
      { username: profile.id },
      {
        provider: "google",
        email: profile._json.email
      },
      function (err, user) {
        return cb(err, user);
      }
    );
  }
));

passport.use(new FacebookStrategy({ // FACEBOOK
        clientID: process.env.FACEBOOK_ID,
        clientSecret: process.env.FACEBOOK_SECRET,
        callbackURL: "http://localhost:3000/auth/facebook/secrets",
        profileFields: ["id", "email"]
    },
    function (accessToken, refreshToken, profile, cb) {
        User.findOrCreate(
          { username: profile.id },
          {
            provider: "facebook",
            email: profile._json.email
          },
          function (err, user) {
            return cb(err, user);
          }
        );
    }
));

// ROUTES

app.get("/", function(req, res){
  res.render("home");
});

app.get("/auth/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

app.get("/auth/facebook",
    passport.authenticate("facebook", { scope: ["email"] })
);

app.get("/auth/google/secrets",
  passport.authenticate("google", { failureRedirect: "/login" }),
  function(req, res) {
    // Successful authentication, redirect to secrets.
    res.redirect('/secrets');
  }
);

app.get('/auth/facebook/secrets',
  passport.authenticate('facebook', { failureRedirect: '/login' }),
  function(req, res) {
    // Successful authentication, redirect home.
    res.redirect('/secrets');
  }
);

app.get("/secrets", function(req, res){
  User.find({"secret": {$ne: null}}, function(err, foundUsers) {
    if(err){
      console.log(err);
    } else {
      if(foundUsers){
        res.render("secrets", {usersWithSecrets: foundUsers});
      }
    }
  })
});

app.route("/submit")
  .get(function(req, res){
    if(req.isAuthenticated()){
      res.render("submit");
    } else {
      res.redirect("/login");
    }
  })
  .post(function(req, res){
    const submittedSecret = req.body.secret;
    console.log(req.user.id);
    User.findById(req.user.id, function(err, foundUser) {
      if(err){
        console.log(err);
      } else {
        if(foundUser) {
          foundUser.secret = submittedSecret;
          foundUser.save(function(){
            res.redirect("/secrets");
          })
        }
      }
    })
  })

app.route("/login")
  .get(function(req, res){
    res.render("login");
  })
  .post(function(req, res){
    const user = new User({
      username: req.body.username,
      password: req.body.password
    });
    req.login(user, function(err) {
        if(err) {
          console.log(err);
        } else {
          passport.authenticate("local");
          res.redirect("/secrets");
        }
    })
  });

app.route("/register")
  .get(function(req, res){
    res.render("register");
  })
  .post(function(req, res){
    const username = req.body.username;
    const password = req.body.password;
    User.register({username: username, email: username, provider: "local"}, password, function(err, user){
      if(err) {
        console.log(err);
        res.redirect("/register");
      } else {
        passport.authenticate("local")(req, res, function(){
          res.redirect("/secrets");
        });
      }
    })
  });

app.get("/logout", function(req, res){
  req.logout();
  res.redirect("/");
})

app.listen(3000, function() {
  console.log("Server started on port 3000");
});
