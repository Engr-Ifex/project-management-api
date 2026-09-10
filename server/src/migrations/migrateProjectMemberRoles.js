import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Project from '../models/Project.js';
import PROJECT_ROLES from '../constants/projectRoles.js';

dotenv.config();

const migrateProjectMemberRoles = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    console.log('Connected to MongoDB');

    // Use the raw MongoDB collection so Mongoose defaults
    // do not hide missing role fields.
    const projects = await Project.collection.find({}).toArray();

    console.log(`Found ${projects.length} projects`);

    let updatedProjects = 0;

    for (const project of projects) {
      const updatedMembers = project.members.map((member) => {
        const isCreator = member.user.equals(project.createdBy);

        return {
          user: member.user,
          role: isCreator ? PROJECT_ROLES.OWNER : PROJECT_ROLES.MEMBER,
          addedAt: member.addedAt ?? new Date(),
        };
      });

      const creatorIsMember = project.members.some((member) =>
        member.user.equals(project.createdBy)
      );

      if (!creatorIsMember) {
        updatedMembers.push({
          user: project.createdBy,
          role: PROJECT_ROLES.OWNER,
          addedAt: new Date(),
        });
      }

      await Project.collection.updateOne(
        { _id: project._id },
        {
          $set: {
            members: updatedMembers,
          },
        }
      );

      updatedProjects++;

      console.log(`Updated project: ${project._id}`);
    }

    console.log(`Migration complete. Updated ${updatedProjects} projects.`);
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
};

migrateProjectMemberRoles();
