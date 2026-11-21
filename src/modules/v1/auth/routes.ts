import { Router } from "express";
import { Signup, Signin, Verify, Refresh } from "./contorller";
import { rateLimit } from "../../../middlewares/rateLimit";
// import { login, register, logout } from "./contorller";

const router = Router();
// const authMiddleware = () => {}
// router.use(authMiddleware);
// router.post("/login", login);

// Throttle account creation: 5 signups per IP per 10 minutes.
router.post("/signup", rateLimit({ max: 5, windowSec: 600, prefix: "rl:signup" }), Signup);

// Throttle sign-in to slow credential-stuffing: 10 attempts per IP per 10 minutes.
router.post("/signin", rateLimit({ max: 10, windowSec: 600, prefix: "rl:signin" }), Signin);

// Throttle verification attempts: 10 per IP per 10 minutes. (Per-user brute-force
// is separately capped inside verifyOtp via the attempts counter.)
router.post("/verify", rateLimit({ max: 10, windowSec: 600, prefix: "rl:verify" }), Verify);

router.post("/refresh", Refresh);

// router.use(requireRole(["admin", "staff"]))

// router.use()



// router.get(``, authMiddleware, (req, resp) => {})
// router.use()


// router.post("/logout", logout);

// router.use()


export default router;
