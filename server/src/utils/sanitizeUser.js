/*
 * The user shape the API returns.
 *
 * An allow-list, not a deny-list: a field added to the model later is absent
 * from responses until it is named here, which is the safe direction for
 * anything sensitive. It is why the reset-token digest and `passwordChangedAt`
 * never leave the process even though the schema carries them.
 */
const sanitizeUser = (user) => {
  const userObject = user.toObject ? user.toObject() : user;

  return {
    id: userObject.id || userObject._id?.toString(),
    name: userObject.name,
    email: userObject.email,
    role: userObject.role,
    avatar: userObject.avatar,
    createdAt: userObject.createdAt,
    updatedAt: userObject.updatedAt,
  };
};

export default sanitizeUser;
