const roleMiddleware = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user?.role) {
      return res.status(401).json({ msg: "Role missing in token" });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ msg: "Access denied" });
    }
    next();
  };
};

module.exports = roleMiddleware;
