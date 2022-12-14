import { config } from "dotenv-safe";
import express from "express";
import bodyParser from "body-parser";
import cookieParser from "cookie-parser";
import logger from "morgan";
import helmet from "helmet";
import httpProxy from "express-http-proxy";
import http from "http";
import jwt from "jsonwebtoken";

import * as usersServiceProxy from "./users/requests.js";

const app = express();
const httpProxyItem = httpProxy

config();

let urlEncodedParser = bodyParser.urlencoded({ extended: false });

app.use(logger("dev"));
app.use(helmet());
app.use(express.json());
app.use(cookieParser());

app.use(bodyParser.urlencoded({ extended: false }));


const boisServiceProxy = httpProxyItem("http://localhost:5001");

const authServiceProxy = httpProxyItem("http://localhost:5000", {
  proxyReqBodyDecorator: function (bodyContent, originalReq) {
    try {
      let retBody = {};
      retBody.login = bodyContent.user;
      retBody.senha = bodyContent.password;
      bodyContent = retBody;
    } catch (e) {
      console.log("- ERRO:" + e);
    }
    return bodyContent;
  },
  proxyReqOptDecorator: function (proxyReqOpts, originalReq) {
    proxyReqOpts.headers["Content-Type"] = "application/json";
    proxyReqOpts.method = "POST";
    return proxyReqOpts;
  },
  userResDecorator: function (proxyRes, proxyResData, userReq, userRes) {
    if (proxyRes.statusCode == 200) {
      let str = Buffer.from(proxyResData).toString("utf-8");
      let objBody = JSON.parse(str);
      const id = objBody.id;
      const token = jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: "1h",
      });
      userRes.status(200);
      return { auth: true, token: token, data: objBody };
    } else {
      userRes.status(401);
      return { auth: false, message: "Login ou senha inválidos" };
    }
  },
});

function verifyJWT(req, res, next) {
  const token = req.headers["x-access-token"];
  if (!token) {
    return res
      .status(401)
      .json({ auth: false, message: "Token não fornecido" });
  } else {
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
      if (err) {
        return res.status(500).json({ auth: false, message: "Token inválido" });
      } else {
        req.userId = decoded.id;
        next();
      }
    });
  }
}

app.post("/login", urlEncodedParser, (req, res, next) => {
  authServiceProxy(req, res, next);
});

app.post("/logout", function (req, res) {
  res.json({ auth: false, token: "null" });
});

app.get("/usuarios", verifyJWT, (req, res, next) => {
  usersServiceProxy.getAllUsers(req, res, next);
});

app.get("/usuarios/:id", verifyJWT, (req, res, next) => {
  req.url = req.originalUrl 

  usersServiceProxy.getUserById(req, res, next);
});

app.post("/usuarios", verifyJWT, (req, res, next) => {
  usersServiceProxy.insertUser(req, res, next);
});

app.put("/usuarios", verifyJWT, (req, res, next) => {

  usersServiceProxy.editUser(req, res, next);
});

app.delete("/usuarios/:id", verifyJWT, (req, res, next) => {
  req.url = req.originalUrl 

  usersServiceProxy.deleteUserById(req, res, next);
});


app.get("bois", verifyJWT, (req, res, next) => {
  boisServiceProxy(req, res, next);
});

let server = http.createServer(app);
server.listen(process.env.PORT || 3000);
