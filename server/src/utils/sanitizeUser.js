const sanitizeUser = (user) => {
  const userObject = user.toObject ? user.toObject() : user;

  return {
    id: userObject.id || userObject._id?.toString(),
    name: userObject.name,
    email: userObject.email,
    role: userObject.role,
    avatar: userObject.avatar,
    isVerified: userObject.isVerified,
    createdAt: userObject.createdAt,
    updatedAt: userObject.updatedAt,
  };
};

export default sanitizeUser;
