package models

import (
	"github.com/goravel/framework/database/orm"
)

type User struct {
	orm.Model
	Name     string `json:"name"`
	Username string `json:"username" gorm:"uniqueIndex"`
	Email    string `json:"email"`
	Password string `json:"-"`
	orm.SoftDeletes
}
