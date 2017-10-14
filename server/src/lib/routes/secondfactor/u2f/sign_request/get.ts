
import objectPath = require("object-path");
import U2f = require("u2f");
import u2f_common = require("../../../secondfactor/u2f/U2FCommon");
import BluebirdPromise = require("bluebird");
import express = require("express");
import { UserDataStore } from "../../../../storage/UserDataStore";
import { U2FRegistrationDocument } from "../../../../storage/U2FRegistrationDocument";
import { Winston } from "../../../../../../types/Dependencies";
import exceptions = require("../../../../Exceptions");
import { SignMessage } from "../../../../../../../shared/SignMessage";
import FirstFactorBlocker from "../../../FirstFactorBlocker";
import ErrorReplies = require("../../../../ErrorReplies");
import { ServerVariablesHandler } from "../../../../ServerVariablesHandler";
import AuthenticationSession = require("../../../../AuthenticationSession");
import UserMessages = require("../../../../../../../shared/UserMessages");

export default FirstFactorBlocker(handler);

export function handler(req: express.Request, res: express.Response): BluebirdPromise<void> {
  const logger = ServerVariablesHandler.getLogger(req.app);
  const userDataStore = ServerVariablesHandler.getUserDataStore(req.app);
  let authSession: AuthenticationSession.AuthenticationSession;
  const appId = u2f_common.extract_app_id(req);

  return AuthenticationSession.get(req)
    .then(function (_authSession: AuthenticationSession.AuthenticationSession) {
      authSession = _authSession;
      return userDataStore.retrieveU2FRegistration(authSession.userid, appId);
    })
    .then(function (doc: U2FRegistrationDocument): BluebirdPromise<SignMessage> {
      if (!doc)
        return BluebirdPromise.reject(new exceptions.AccessDeniedError("No U2F registration found"));

      const u2f = ServerVariablesHandler.getU2F(req.app);
      const appId: string = u2f_common.extract_app_id(req);
      logger.info(req, "Start authentication of app '%s'", appId);
      logger.debug(req, "AppId = %s, keyHandle = %s", appId, JSON.stringify(doc.registration.keyHandle));

      const request = u2f.request(appId, doc.registration.keyHandle);
      const authenticationMessage: SignMessage = {
        request: request,
        keyHandle: doc.registration.keyHandle
      };
      return BluebirdPromise.resolve(authenticationMessage);
    })
    .then(function (authenticationMessage: SignMessage) {
      logger.info(req, "Store authentication request and reply");
      logger.debug(req, "AuthenticationRequest = %s", authenticationMessage);
      authSession.sign_request = authenticationMessage.request;
      res.json(authenticationMessage);
      return BluebirdPromise.resolve();
    })
    .catch(ErrorReplies.replyWithError200(req, res, logger,
      UserMessages.OPERATION_FAILED));
}

